/**
 * 작업 목록 — 부모-자식 트리를 들여쓰기로 평면 표시.
 * 상태 배지, 진척도 바, 일자, 담당자 표시.
 *
 * D&D 재정렬은 4단계 후속(WBS 화면에서) 또는 5단계 이후로 미룸 — 모바일 터치 D&D 가
 * 별도 작업이라 우선 add/edit/delete 만 안정화.
 */
import { useEffect, useState, useCallback } from 'react'
import {
  listTasks,
  createTask,
  updateTask,
  softDeleteTask,
  buildTaskTree,
} from '../api/tasks.js'
import TaskModal from './TaskModal.jsx'

export default function TaskList({ project }) {
  const [items, setItems] = useState([])     // 트리 평면 배열 (depth 포함)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | 'new' | task obj
  const [err, setErr] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const tasks = await listTasks(project.uuid)
      setItems(buildTaskTree(tasks))
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
      await updateTask(editing.uuid, form)
    } else {
      // 새 작업 — 같은 부모 아래의 마지막 형제 다음 order_idx
      const all = await listTasks(project.uuid)
      const sib = all.filter((t) => (t.parent_uuid || null) === (form.parent_uuid || null))
      const nextIdx = sib.length === 0
        ? 0
        : Math.max(...sib.map((t) => t.order_idx ?? 0)) + 1
      await createTask({ ...form, order_idx: nextIdx })
    }
    setEditing(null)
    await refresh()
  }

  const onDelete = async (t) => {
    const ok = window.confirm(
      `'${t.name}' 작업을 삭제할까요?\n` +
      `하위 작업들도 같이 표식됩니다. 30일 안에 동기화로 다시 살릴 수 있어요.`
    )
    if (!ok) return
    await softDeleteTask(t.uuid)
    await refresh()
  }

  // 부모 선택지 산출에 쓸 평면 배열 (편집 모달이 호출)
  const flatForParents = items.map((t) => ({ uuid: t.uuid, name: t.name, parent_uuid: t.parent_uuid }))

  return (
    <div>
      <div className="pm-list-header">
        <div>
          <div className="pm-list-title" style={{ fontSize: '1.1rem' }}>작업 목록</div>
          <p className="pm-list-sub">
            {loading ? '불러오는 중…' : `총 ${items.length}건`}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setEditing('new')}>+ 새 작업</button>
      </div>

      {err && <div className="pm-error">{err}</div>}

      {!loading && items.length === 0 && (
        <div className="pm-empty">
          <div className="pm-empty-icon">📝</div>
          <p>아직 작업이 없어요</p>
          <button className="btn-primary" onClick={() => setEditing('new')}>+ 첫 작업 만들기</button>
        </div>
      )}

      {items.length > 0 && (
        <div className="task-list-card">
          {items.map((t) => (
            <TaskRow
              key={t.uuid}
              task={t}
              onEdit={() => setEditing(t)}
              onDelete={() => onDelete(t)}
            />
          ))}
        </div>
      )}

      {editing && (
        <TaskModal
          value={editing === 'new' ? null : editing}
          projectUuid={project.uuid}
          allTasks={flatForParents}
          onSubmit={onSubmit}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function TaskRow({ task, onEdit, onDelete }) {
  const indent = (task.depth || 0) * 22
  const overdue = isOverdue(task.end_date) && task.status !== '완료'
  return (
    <div className="task-row">
      <div className="task-row-main" style={{ paddingLeft: indent }}>
        {(task.depth || 0) > 0 && <span className="task-row-bullet">↳</span>}
        <div className="task-row-name">{task.name}</div>
        <span className={`badge ${statusBadge(task.status)}`}>{task.status}</span>
      </div>

      <div className="task-row-meta">
        {task.assignee && <span>👤 {task.assignee}</span>}
        {task.start_date && <span>{task.start_date}</span>}
        {task.end_date && <span className={overdue ? 'over' : ''}>~ {task.end_date}</span>}
        <span className="task-row-prog">
          <span className="prog-track" style={{ width: 70 }}>
            <span className="prog-fill" style={{ width: `${task.progress || 0}%`, background: '#007AFF' }} />
          </span>
          <span style={{ minWidth: 30 }}>{task.progress || 0}%</span>
        </span>
      </div>

      <div className="task-row-actions">
        <button className="icon-btn" onClick={onEdit} aria-label="수정">✎</button>
        <button className="icon-btn red" onClick={onDelete} aria-label="삭제">✕</button>
      </div>
    </div>
  )
}

function statusBadge(s) {
  switch (s) {
    case '완료':   return 'green'
    case '진행중': return 'blue'
    case '지연':   return 'red'
    case '보류':   return 'yellow'
    case '계획':
    default:       return 'gray'
  }
}

function isOverdue(endDate) {
  if (!endDate) return false
  const today = new Date().toISOString().slice(0, 10)
  return endDate < today
}
