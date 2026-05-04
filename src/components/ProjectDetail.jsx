/**
 * 프로젝트 상세 화면.
 *
 * 상단 헤더: 색바 + 이름/설명 + 일자 + 진척도 + ←뒤로 + 수정 버튼
 * 탭: 작업 / 마일스톤 / WBS(다음 묶음 자리)
 */
import { useEffect, useState, useCallback } from 'react'
import { getProject, updateProject, getProjectStats } from '../api/projects.js'
import TaskList from './TaskList.jsx'
import MilestoneList from './MilestoneList.jsx'
import ProjectModal from './ProjectModal.jsx'
import WbsView from './WbsView.jsx'
import ProjectDashboard from './ProjectDashboard.jsx'

// 사용자 지정 순서: 대시보드 → WBS → 작업(업무목록) → 마일스톤
const TABS = [
  { key: 'dashboard',  label: '대시보드' },
  { key: 'wbs',        label: 'WBS' },
  { key: 'tasks',      label: '업무목록' },
  { key: 'milestones', label: '마일스톤' },
]

export default function ProjectDetail({ projectUuid, onBack }) {
  const [project, setProject] = useState(null)
  const [stats, setStats] = useState(null)
  const [tab, setTab] = useState('dashboard')
  const [editing, setEditing] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  const refresh = useCallback(async () => {
    const p = await getProject(projectUuid)
    setProject(p)
    if (p) setStats(await getProjectStats(projectUuid))
  }, [projectUuid])

  useEffect(() => { refresh() }, [refresh, refreshTick])

  // 작업/마일스톤이 추가/수정/삭제될 때마다 헤더의 통계도 갱신되도록.
  // 자식 컴포넌트가 변경한 직후 같은 IndexedDB 를 다시 읽으므로 약간 지연 후 호출.
  // 실용상 탭 전환·상세 재진입 시 자연스럽게 반영되어 별도 이벤트버스 없이 단순 처리.
  // 필요 시 4단계 후속에서 Dexie hook 도입.

  if (!project) {
    return (
      <div className="pm-root">
        <button className="btn-ghost" onClick={onBack}>← 목록으로</button>
        <p style={{ marginTop: 14, color: '#86868b' }}>프로젝트를 불러오는 중…</p>
      </div>
    )
  }

  return (
    <div className="pm-root">
      <button className="btn-ghost" onClick={onBack} style={{ marginBottom: 12 }}>← 목록으로</button>

      <header className="detail-header" style={{ borderLeftColor: project.color || '#007AFF' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="detail-title">{project.name}</div>
          {project.description && <div className="detail-desc">{project.description}</div>}
          <div className="detail-meta">
            {project.start_date && <span>시작 {project.start_date}</span>}
            {project.end_date && <span>종료 {project.end_date}</span>}
            <span className={`badge ${statusBadge(project.status)}`}>{project.status}</span>
          </div>
        </div>
        <div className="detail-right">
          <div className="detail-prog">
            <div className="prog-track">
              <div className="prog-fill" style={{
                width: `${stats?.avg_progress || 0}%`,
                background: project.color || '#007AFF',
              }} />
            </div>
            <div className="detail-prog-num">{stats?.avg_progress || 0}%</div>
          </div>
          <div className="detail-stats">
            총 {stats?.task_total || 0} · 완료 {stats?.task_done || 0} · 진행 {stats?.task_in_progress || 0}
            {(stats?.task_delayed || 0) > 0 && <> · <span style={{ color: '#E53E3E', fontWeight: 600 }}>지연 {stats.task_delayed}</span></>}
          </div>
          <button className="btn-ghost" onClick={() => setEditing(true)}>프로젝트 수정</button>
        </div>
      </header>

      <nav className="detail-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`detail-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => { setTab(t.key); setRefreshTick((n) => n + 1) }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <section className="detail-content">
        {tab === 'dashboard' && (
          <ProjectDashboard project={project} key={`dash-${refreshTick}`} />
        )}
        {tab === 'wbs' && (
          <WbsView project={project} key={`wbs-${refreshTick}`} />
        )}
        {tab === 'tasks' && (
          <TaskList project={project} key={`tasks-${refreshTick}`} />
        )}
        {tab === 'milestones' && (
          <MilestoneList project={project} key={`ms-${refreshTick}`} />
        )}
      </section>

      {editing && (
        <ProjectModal
          value={project}
          onSubmit={async (form) => {
            await updateProject(project.uuid, form)
            setEditing(false)
            setRefreshTick((n) => n + 1)
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  )
}

function statusBadge(status) {
  switch (status) {
    case '완료':   return 'green'
    case '진행중': return 'blue'
    case '보류':   return 'yellow'
    case '계획':   return 'gray'
    default:       return 'gray'
  }
}
