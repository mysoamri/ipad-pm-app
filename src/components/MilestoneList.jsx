/**
 * 마일스톤 목록 — 카드 한 줄당 한 개. 마감일 기준 오름차순.
 */
import { useEffect, useState, useCallback } from 'react'
import {
  listMilestones,
  createMilestone,
  updateMilestone,
  softDeleteMilestone,
} from '../api/milestones.js'
import MilestoneModal from './MilestoneModal.jsx'

export default function MilestoneList({ project }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [err, setErr] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await listMilestones(project.uuid))
      setErr('')
    } catch (e) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [project.uuid])

  useEffect(() => { refresh() }, [refresh])

  const onSubmit = async (form) => {
    if (editing && typeof editing === 'object') {
      await updateMilestone(editing.uuid, form)
    } else {
      await createMilestone(form)
    }
    setEditing(null)
    await refresh()
  }

  const onDelete = async (m) => {
    if (!window.confirm(`'${m.name}' 마일스톤을 삭제할까요?`)) return
    await softDeleteMilestone(m.uuid)
    await refresh()
  }

  return (
    <div>
      <div className="pm-list-header">
        <div>
          <div className="pm-list-title" style={{ fontSize: '1.1rem' }}>마일스톤</div>
          <p className="pm-list-sub">
            {loading ? '불러오는 중…' : `총 ${items.length}건`}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setEditing('new')}>+ 새 마일스톤</button>
      </div>

      {err && <div className="pm-error">{err}</div>}

      {!loading && items.length === 0 && (
        <div className="pm-empty">
          <div className="pm-empty-icon">🎯</div>
          <p>마일스톤이 아직 없어요</p>
          <button className="btn-primary" onClick={() => setEditing('new')}>+ 첫 마일스톤 만들기</button>
        </div>
      )}

      {items.length > 0 && (
        <div className="ms-list">
          {items.map((m) => (
            <MilestoneCard
              key={m.uuid}
              ms={m}
              onEdit={() => setEditing(m)}
              onDelete={() => onDelete(m)}
            />
          ))}
        </div>
      )}

      {editing && (
        <MilestoneModal
          value={editing === 'new' ? null : editing}
          projectUuid={project.uuid}
          onSubmit={onSubmit}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function MilestoneCard({ ms, onEdit, onDelete }) {
  const days = daysUntil(ms.due_date)
  const past = days !== null && days < 0
  return (
    <div className="ms-card">
      <div className="ms-card-left">
        <span className="ms-diamond">◆</span>
        <div>
          <div className="ms-name">{ms.name}</div>
          {ms.memo && <div className="ms-memo">{ms.memo}</div>}
        </div>
      </div>
      <div className="ms-card-right">
        <span className={`badge ${msBadge(ms.status)}`}>{ms.status}</span>
        <span className="ms-date">{ms.due_date}</span>
        {days !== null && (
          <span className={past ? 'ms-days over' : 'ms-days'}>
            {days === 0 ? 'D-Day' : days > 0 ? `D-${days}` : `D+${-days}`}
          </span>
        )}
        <button className="icon-btn" onClick={onEdit} aria-label="수정">✎</button>
        <button className="icon-btn red" onClick={onDelete} aria-label="삭제">✕</button>
      </div>
    </div>
  )
}

function msBadge(s) {
  if (s === '달성') return 'green'
  if (s === '지연') return 'red'
  return 'blue'
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const today = new Date().toISOString().slice(0, 10)
  const t = new Date(today + 'T00:00:00Z').getTime()
  const d = new Date(dateStr + 'T00:00:00Z').getTime()
  return Math.round((d - t) / 86400000)
}
