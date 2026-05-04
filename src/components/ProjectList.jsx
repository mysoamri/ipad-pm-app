/**
 * 프로젝트 목록 화면 — 카드 그리드.
 * 카드 탭: (4단계 후속에서) 상세 화면으로 진입.
 * 우상단 ⋯: 수정 / 삭제.
 */
import { useEffect, useState, useCallback } from 'react'
import {
  listProjects,
  createProject,
  updateProject,
  softDeleteProject,
  getProjectStats,
} from '../api/projects.js'
import ProjectModal from './ProjectModal.jsx'

export default function ProjectList({ onOpen }) {
  const [items, setItems] = useState([])     // [{...project, _stats}]
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)  // null | 'new' | project obj
  const [err, setErr] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const projects = await listProjects()
      const enriched = await Promise.all(
        projects.map(async (p) => ({ ...p, _stats: await getProjectStats(p.uuid) }))
      )
      setItems(enriched)
      setErr('')
    } catch (e) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const onSubmit = async (form) => {
    if (editing && typeof editing === 'object') {
      await updateProject(editing.uuid, form)
    } else {
      await createProject(form)
    }
    setEditing(null)
    await refresh()
  }

  const onDelete = async (p) => {
    const ok = window.confirm(
      `'${p.name}' 프로젝트를 삭제할까요? 안의 작업/마일스톤도 같이 표식됩니다.\n` +
      `(완전히 사라지는 데는 30일 — 그동안 동기화로 다시 살리실 수 있습니다.)`
    )
    if (!ok) return
    await softDeleteProject(p.uuid)
    await refresh()
  }

  return (
    <div className="pm-root">
      <div className="pm-list-header">
        <div>
          <div className="pm-list-title">프로젝트</div>
          <p className="pm-list-sub">
            {loading ? '불러오는 중…' : `총 ${items.length}개`}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setEditing('new')}>
          + 새 프로젝트
        </button>
      </div>

      {err && <div className="pm-error">{err}</div>}

      {!loading && items.length === 0 && (
        <div className="pm-empty">
          <div className="pm-empty-icon">📋</div>
          <p>아직 프로젝트가 없어요</p>
          <button className="btn-primary" onClick={() => setEditing('new')}>
            + 첫 프로젝트 만들기
          </button>
        </div>
      )}

      <div className="pm-card-grid">
        {items.map((p) => (
          <ProjectCard
            key={p.uuid}
            project={p}
            onOpen={() => onOpen?.(p)}
            onEdit={() => setEditing(p)}
            onDelete={() => onDelete(p)}
          />
        ))}
      </div>

      {editing && (
        <ProjectModal
          value={editing === 'new' ? null : editing}
          onSubmit={onSubmit}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function ProjectCard({ project, onOpen, onEdit, onDelete }) {
  const s = project._stats || {}
  const overdue = isOverdue(project.end_date)
  return (
    <div
      className="pm-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }}
    >
      <div className="pm-card-bar" style={{ background: project.color || '#007AFF' }} />
      <div className="pm-card-body">
        <div className="pm-card-top">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="pm-card-name">{project.name}</div>
            {project.description && (
              <div className="pm-card-desc">{project.description}</div>
            )}
          </div>
          <span className={`badge ${statusBadge(project.status)}`}>{project.status}</span>
        </div>

        <div className="pm-card-prog-row">
          <div className="prog-track">
            <div
              className="prog-fill"
              style={{
                width: `${s.avg_progress || 0}%`,
                background: project.color || '#007AFF',
              }}
            />
          </div>
          <div className="pm-card-prog-num">{s.avg_progress || 0}%</div>
        </div>

        <div className="pm-card-stats">
          <span>총 {s.task_total || 0}</span>
          <span>완료 {s.task_done || 0}</span>
          <span>진행 {s.task_in_progress || 0}</span>
          {(s.task_delayed || 0) > 0 && (
            <span className="over">지연 {s.task_delayed}</span>
          )}
          {project.end_date && (
            <span className={overdue ? 'over' : ''}>
              종료 {project.end_date}
            </span>
          )}
        </div>
      </div>

      <div className="pm-card-actions" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn" onClick={onEdit} aria-label="수정">✎</button>
        <button className="icon-btn red" onClick={onDelete} aria-label="삭제">✕</button>
      </div>
    </div>
  )
}

// ── 헬퍼 ────────────────────────────────────────────────────────────────
function statusBadge(status) {
  switch (status) {
    case '완료':   return 'green'
    case '진행중': return 'blue'
    case '보류':   return 'yellow'
    case '계획':   return 'gray'
    default:      return 'gray'
  }
}

function isOverdue(endDate) {
  if (!endDate) return false
  // YYYY-MM-DD 비교 — 오늘 날짜(local) 와 문자열 비교로 충분
  const today = new Date().toISOString().slice(0, 10)
  return endDate < today
}
