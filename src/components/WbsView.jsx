/**
 * WBS 간트 차트 — 보기 + 드래그 편집(2차).
 *
 * 드래그 종류 (PointerEvent 통합 처리, 터치/마우스 모두):
 *  - bar  : 본체 드래그 → start_date/end_date 동시 이동
 *  - left : 좌측 핸들 드래그 → start_date 만 이동
 *  - right: 우측 핸들 드래그 → end_date 만 이동
 *  - ms   : 마일스톤 다이아몬드 드래그 → due_date 이동
 *
 * 1일 = DAY_PX 픽셀. setPointerCapture 로 손가락이 바깥으로 나가도 추적 유지.
 */
import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { listTasks, updateTask, buildTaskTree } from '../api/tasks.js'
import { listMilestones, updateMilestone } from '../api/milestones.js'

const DAY_PX     = 28
const ROW_H      = 36
const HEADER_H   = 56
const LABEL_COL  = 220
const PAD_DAYS   = 7

export default function WbsView({ project }) {
  const [tasks, setTasks] = useState([])
  const [milestones, setMilestones] = useState([])
  const [loading, setLoading] = useState(true)
  // 드래그 상태 — 한 번에 하나만. null 또는 객체.
  // { kind: 'bar'|'left'|'right'|'ms', uuid, pointerId, startX,
  //   origStart, origEnd, origDue, deltaDays }
  const [drag, setDrag] = useState(null)
  const dragRef = useRef(null)
  dragRef.current = drag

  const refresh = useCallback(async () => {
    setLoading(true)
    const ts = await listTasks(project.uuid)
    const ms = await listMilestones(project.uuid)
    setTasks(buildTaskTree(ts))
    setMilestones(ms)
    setLoading(false)
  }, [project.uuid])

  useEffect(() => { refresh() }, [refresh])

  const range = useMemo(() => computeRange(tasks, milestones), [tasks, milestones])
  const days  = useMemo(() => listDays(range.start, range.end), [range])
  const months = useMemo(() => groupMonths(days), [days])

  // ── 드래그 이벤트 ────────────────────────────────────────────────────
  const startDrag = (e, payload) => {
    e.preventDefault()
    e.stopPropagation()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
    setDrag({ ...payload, pointerId: e.pointerId, startX: e.clientX, deltaDays: 0 })
  }

  const moveDrag = (e) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const days = Math.round((e.clientX - d.startX) / DAY_PX)
    if (days !== d.deltaDays) {
      setDrag({ ...d, deltaDays: days })
    }
  }

  const endDrag = async (e) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    setDrag(null)
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}

    const delta = d.deltaDays
    if (delta === 0) return  // 변화 없음 — DB 호출 생략

    if (d.kind === 'ms') {
      const newDue = addDays(d.origDue, delta)
      await updateMilestone(d.uuid, { due_date: newDue })
    } else {
      let newStart = d.origStart
      let newEnd   = d.origEnd
      if (d.kind === 'bar') {
        newStart = addDays(d.origStart, delta)
        newEnd   = addDays(d.origEnd,   delta)
      } else if (d.kind === 'left') {
        newStart = addDays(d.origStart, delta)
        // 시작일이 종료일을 넘으면 같은 날로 클램프
        if (newStart > newEnd) newStart = newEnd
      } else if (d.kind === 'right') {
        newEnd = addDays(d.origEnd, delta)
        if (newEnd < newStart) newEnd = newStart
      }
      await updateTask(d.uuid, { start_date: newStart, end_date: newEnd })
    }
    await refresh()
  }

  if (loading) {
    return <div className="pm-empty"><p>WBS 를 그리는 중…</p></div>
  }
  if (tasks.length === 0 && milestones.length === 0) {
    return (
      <div className="pm-empty">
        <div className="pm-empty-icon">📊</div>
        <p>표시할 작업이 없습니다.</p>
        <p style={{ fontSize: '0.85rem' }}>
          작업 탭에서 일자가 있는 작업을 먼저 추가하시면 여기에 자동으로 그려집니다.
        </p>
      </div>
    )
  }

  const totalWidth  = days.length * DAY_PX
  const totalHeight = HEADER_H + tasks.length * ROW_H

  const todayStr = new Date().toISOString().slice(0, 10)
  const todayIdx = days.indexOf(todayStr)

  return (
    <div className="wbs-wrap">
      <div className="wbs-container" style={{ minWidth: LABEL_COL + totalWidth }}>
        {/* 좌측 라벨 컬럼 */}
        <div className="wbs-labels" style={{ width: LABEL_COL }}>
          <div className="wbs-header-cell" style={{ height: HEADER_H }}>작업명</div>
          {tasks.map((t) => (
            <div
              key={t.uuid}
              className="wbs-label-row"
              style={{ height: ROW_H, paddingLeft: 10 + (t.depth || 0) * 16 }}
              title={t.name}
            >
              {(t.depth || 0) > 0 && <span className="wbs-depth-dot">↳</span>}
              <span className="wbs-label-name">{t.name}</span>
            </div>
          ))}
        </div>

        {/* 우측 타임라인 */}
        <div className="wbs-timeline" style={{ width: totalWidth, minHeight: totalHeight }}>
          {/* 헤더 — 월(상) */}
          <div className="wbs-month-row" style={{ height: HEADER_H / 2 }}>
            {months.map((m) => (
              <div
                key={m.label + m.startIdx}
                className="wbs-month-label"
                style={{ left: m.startIdx * DAY_PX, width: m.span * DAY_PX }}
                title={m.label}
              >
                {m.label}
              </div>
            ))}
          </div>
          {/* 헤더 — 일(하) */}
          <div className="wbs-day-row" style={{ height: HEADER_H / 2, top: HEADER_H / 2 }}>
            {days.map((d, i) => {
              const dow = new Date(d + 'T00:00:00Z').getUTCDay()
              const cls = dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''
              return (
                <div
                  key={d}
                  className={`wbs-day-cell ${cls}`}
                  style={{ left: i * DAY_PX, width: DAY_PX, height: HEADER_H / 2 }}
                >
                  <div className="wbs-day-num">{Number(d.slice(8, 10))}</div>
                  <div className="wbs-day-dow">{['일','월','화','수','목','금','토'][dow]}</div>
                </div>
              )
            })}
          </div>

          {/* 주말 음영 */}
          <div
            className="wbs-weekend-overlay"
            style={{
              top: HEADER_H,
              height: tasks.length * ROW_H,
              width: totalWidth,
            }}
          >
            {days.map((d, i) => {
              const dow = new Date(d + 'T00:00:00Z').getUTCDay()
              if (dow !== 0 && dow !== 6) return null
              const cls = dow === 0 ? 'sun' : 'sat'
              return (
                <div
                  key={d}
                  className={`wbs-weekend-stripe ${cls}`}
                  style={{ left: i * DAY_PX, width: DAY_PX }}
                />
              )
            })}
          </div>

          {/* 본문: 행별 작업 바 */}
          {tasks.map((t, rowIdx) => (
            <div
              key={t.uuid}
              className="wbs-bar-row"
              style={{ top: HEADER_H + rowIdx * ROW_H, height: ROW_H, width: totalWidth }}
            >
              <Bar
                task={t}
                range={range}
                projectColor={project.color}
                drag={drag}
                onPointerDownBar={(e) => startDrag(e, {
                  kind: 'bar', uuid: t.uuid,
                  origStart: t.start_date || t.end_date,
                  origEnd:   t.end_date   || t.start_date,
                })}
                onPointerDownLeft={(e) => startDrag(e, {
                  kind: 'left', uuid: t.uuid,
                  origStart: t.start_date || t.end_date,
                  origEnd:   t.end_date   || t.start_date,
                })}
                onPointerDownRight={(e) => startDrag(e, {
                  kind: 'right', uuid: t.uuid,
                  origStart: t.start_date || t.end_date,
                  origEnd:   t.end_date   || t.start_date,
                })}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              />
            </div>
          ))}

          {/* 마일스톤 다이아몬드 */}
          {milestones.map((m) => {
            const draggingThis = drag && drag.kind === 'ms' && drag.uuid === m.uuid
            const due = draggingThis ? addDays(drag.origDue, drag.deltaDays) : m.due_date
            const idx = days.indexOf(due)
            if (idx < 0) return null
            return (
              <div
                key={m.uuid}
                className={`wbs-milestone draggable ${draggingThis ? 'dragging' : ''}`}
                style={{ left: idx * DAY_PX + DAY_PX / 2, top: HEADER_H + 4 }}
                title={`${m.name} · ${due}`}
                onPointerDown={(e) => startDrag(e, { kind: 'ms', uuid: m.uuid, origDue: m.due_date })}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                ◆<span className="wbs-ms-name">{m.name}</span>
              </div>
            )
          })}

          {/* 오늘 표시 */}
          {todayIdx >= 0 && (
            <div
              className="wbs-today-shade"
              style={{
                left: todayIdx * DAY_PX,
                width: DAY_PX,
                top: 0,
                height: HEADER_H + tasks.length * ROW_H,
              }}
            >
              <span className="wbs-today-label">오늘</span>
            </div>
          )}
        </div>
      </div>
      <p style={styles.hint}>
        💡 작업 막대를 길게 눌러 좌우로 끌면 일자가 바뀝니다(끝부분 핸들은 한쪽만).
        마일스톤(◆)도 같은 식으로 끌어 옮길 수 있습니다.
      </p>
    </div>
  )
}

// ── 작업 바 ─────────────────────────────────────────────────────────────
function Bar({
  task, range, projectColor, drag,
  onPointerDownBar, onPointerDownLeft, onPointerDownRight,
  onPointerMove, onPointerUp, onPointerCancel,
}) {
  if (!task.start_date && !task.end_date) {
    return <div className="wbs-bar-empty">일자 없음 — 모달에서 시작·종료일 설정 시 표시됩니다</div>
  }

  // 드래그 중인 경우 임시 일자로 그리기
  const draggingThis = drag && drag.uuid === task.uuid
  const origStart = task.start_date || task.end_date
  const origEnd   = task.end_date   || task.start_date
  let s = origStart, e = origEnd
  if (draggingThis) {
    if (drag.kind === 'bar') {
      s = addDays(origStart, drag.deltaDays)
      e = addDays(origEnd,   drag.deltaDays)
    } else if (drag.kind === 'left') {
      s = addDays(origStart, drag.deltaDays)
      if (s > e) s = e
    } else if (drag.kind === 'right') {
      e = addDays(origEnd, drag.deltaDays)
      if (e < s) e = s
    }
  }

  const startIdx = daysBetween(range.start, s)
  const endIdx   = daysBetween(range.start, e) + 1
  if (endIdx <= 0) return null
  const left  = Math.max(0, startIdx) * DAY_PX
  const width = (endIdx - Math.max(0, startIdx)) * DAY_PX
  if (width <= 0) return null

  const color = projectColor || '#007AFF'
  const progress = Math.min(100, Math.max(0, task.progress || 0))

  return (
    <div
      className={`wbs-bar draggable ${draggingThis ? 'dragging' : ''}`}
      style={{
        left, width,
        background: hexToRgba(color, 0.18),
        borderColor: color,
      }}
      title={`${task.name} · ${s} ~ ${e} · ${progress}%`}
      onPointerDown={onPointerDownBar}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <div
        className="wbs-bar-fill"
        style={{ width: `${progress}%`, background: color }}
      />
      <span className="wbs-bar-label">{task.name}</span>

      {/* 좌·우 핸들 — onPointerDown 만 따로 받고, 부모로 버블링은 stop. */}
      <div
        className="wbs-bar-handle left"
        onPointerDown={(e) => { e.stopPropagation(); onPointerDownLeft(e) }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />
      <div
        className="wbs-bar-handle right"
        onPointerDown={(e) => { e.stopPropagation(); onPointerDownRight(e) }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />
    </div>
  )
}

// ── 헬퍼 ────────────────────────────────────────────────────────────────
function computeRange(tasks, milestones) {
  const allDates = []
  for (const t of tasks) {
    if (t.start_date) allDates.push(t.start_date)
    if (t.end_date)   allDates.push(t.end_date)
  }
  for (const m of milestones) {
    if (m.due_date) allDates.push(m.due_date)
  }
  if (allDates.length === 0) {
    const today = new Date().toISOString().slice(0, 10)
    return { start: addDays(today, -30), end: addDays(today, 30) }
  }
  allDates.sort()
  return {
    start: addDays(allDates[0], -PAD_DAYS),
    end:   addDays(allDates[allDates.length - 1], PAD_DAYS),
  }
}

function listDays(startIso, endIso) {
  const out = []
  let d = startIso
  while (d <= endIso) { out.push(d); d = addDays(d, 1) }
  return out
}

function groupMonths(days) {
  const out = []
  let cur = null
  days.forEach((d, i) => {
    const ymKey = d.slice(0, 7)
    const label = `${Number(d.slice(0, 4))}년 ${Number(d.slice(5, 7))}월`
    if (!cur || cur.ymKey !== ymKey) {
      cur = { ymKey, label, startIdx: i, span: 1 }
      out.push(cur)
    } else {
      cur.span += 1
    }
  })
  return out
}

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function daysBetween(a, b) {
  const da = new Date(a + 'T00:00:00Z').getTime()
  const db = new Date(b + 'T00:00:00Z').getTime()
  return Math.round((db - da) / 86400000)
}
function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const styles = {
  hint: {
    margin: '12px 14px 14px',
    color: '#86868b',
    fontSize: '0.78rem',
    lineHeight: 1.5,
  },
}
