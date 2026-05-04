/**
 * 프로젝트 대시보드 탭 — 한 프로젝트의 요약 화면.
 *
 * 구성
 *  - KPI 카드 5개 (총·완료·진행중·지연·평균 진척도)
 *  - 평균 진척도 바
 *  - 임박 마일스톤 (3건) — D-day 가 가까운 순
 *  - 임박/지연 작업 (5건)  — 종료일이 가까운 순, 지연 우선
 *
 * 맥 dashboard 의 같은 화면을 단순화해서 가져옴.
 */
import { useEffect, useState, useCallback } from 'react'
import { listTasks } from '../api/tasks.js'
import { listMilestones } from '../api/milestones.js'

export default function ProjectDashboard({ project }) {
  const [tasks, setTasks] = useState([])
  const [milestones, setMilestones] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const [ts, ms] = await Promise.all([
      listTasks(project.uuid),
      listMilestones(project.uuid),
    ])
    setTasks(ts)
    setMilestones(ms)
    setLoading(false)
  }, [project.uuid])

  useEffect(() => { refresh() }, [refresh])

  if (loading) return <div className="pm-empty"><p>대시보드 준비 중…</p></div>

  // 통계
  const total = tasks.length
  const done  = tasks.filter((t) => t.status === '완료').length
  const ip    = tasks.filter((t) => t.status === '진행중').length
  const dl    = tasks.filter((t) => t.status === '지연').length
  const avgProgress = total === 0
    ? 0
    : Math.round(tasks.reduce((s, t) => s + (t.progress || 0), 0) / total)

  // 임박 마일스톤 (오늘 이후, 가까운 순) 3건
  const today = new Date().toISOString().slice(0, 10)
  const upcomingMs = milestones
    .filter((m) => m.status !== '달성')
    .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')))
    .slice(0, 3)

  // 임박/지연 작업 (지연 우선, 그다음 종료일 가까운 순) 5건
  const upcomingTasks = tasks
    .filter((t) => t.status !== '완료')
    .map((t) => ({
      ...t,
      _overdue: t.end_date && t.end_date < today,
    }))
    .sort((a, b) => {
      if (a._overdue !== b._overdue) return a._overdue ? -1 : 1
      return String(a.end_date || '9999').localeCompare(String(b.end_date || '9999'))
    })
    .slice(0, 5)

  return (
    <div className="dash-wrap">
      {/* KPI 카드들 */}
      <div className="dash-kpi-row">
        <KpiCard tone="" label="총 작업" value={total} />
        <KpiCard tone="green" label="완료" value={done} />
        <KpiCard tone="blue"  label="진행중" value={ip} />
        <KpiCard tone="red"   label="지연" value={dl} />
        <KpiCard tone="yellow" label="평균 진척도" value={`${avgProgress}%`} />
      </div>

      {/* 진척도 바 */}
      <div className="dash-section">
        <div className="dash-section-title">전체 진척도</div>
        <div className="dash-prog-row">
          <div className="prog-track" style={{ flex: 1 }}>
            <div className="prog-fill" style={{
              width: `${avgProgress}%`,
              background: project.color || '#007AFF',
            }} />
          </div>
          <div className="dash-prog-pct">{avgProgress}%</div>
        </div>
      </div>

      {/* 2열 (좁아지면 1열) */}
      <div className="dash-2col">
        <div className="dash-section">
          <div className="dash-section-title">임박 마일스톤</div>
          {upcomingMs.length === 0 ? (
            <p className="dash-empty">예정된 마일스톤이 없습니다.</p>
          ) : upcomingMs.map((m) => {
            const days = daysUntil(m.due_date)
            const past = days !== null && days < 0
            return (
              <div className="dash-ms-row" key={m.uuid}>
                <span className="dash-ms-diamond">◆</span>
                <span className="dash-ms-name">{m.name}</span>
                <span className="dash-ms-date">{m.due_date}</span>
                {days !== null && (
                  <span className={past ? 'dash-ms-days over' : 'dash-ms-days'}>
                    {days === 0 ? 'D-Day' : days > 0 ? `D-${days}` : `D+${-days}`}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        <div className="dash-section">
          <div className="dash-section-title">임박 / 지연 작업</div>
          {upcomingTasks.length === 0 ? (
            <p className="dash-empty">표시할 작업이 없습니다.</p>
          ) : upcomingTasks.map((t) => (
            <div className="dash-task-row" key={t.uuid}>
              <span className="dash-task-name">{t.name}</span>
              <span className="dash-assignee">
                {t.end_date && (
                  <span className={t._overdue ? 'dash-ms-days over' : ''}>{t.end_date}</span>
                )}
                {t.assignee && <> · {t.assignee}</>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function KpiCard({ tone, label, value }) {
  return (
    <div className={`kpi-card ${tone || ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
    </div>
  )
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const today = new Date().toISOString().slice(0, 10)
  const t = new Date(today + 'T00:00:00Z').getTime()
  const d = new Date(dateStr + 'T00:00:00Z').getTime()
  return Math.round((d - t) / 86400000)
}
