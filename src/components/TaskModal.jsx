/**
 * 작업 추가/수정 모달.
 * value=null → 추가, value=객체 → 수정.
 *
 * 부모 선택 select 는 자기 자신/자손 제외 (순환 차단).
 */
import { useEffect, useState } from 'react'
import { getParentCandidates } from '../api/tasks.js'

const STATUSES   = ['계획', '진행중', '완료', '지연', '보류']
const PRIORITIES = ['상', '중', '하']

export default function TaskModal({ value, projectUuid, allTasks, onSubmit, onCancel }) {
  const isEdit = !!value
  const [form, setForm] = useState(() => ({
    name:        value?.name        || '',
    assignee:    value?.assignee    || '',
    parent_uuid: value?.parent_uuid || '',
    start_date:  value?.start_date  || '',
    end_date:    value?.end_date    || '',
    status:      value?.status      || '계획',
    progress:    value?.progress    ?? 0,
    priority:    value?.priority    || '중',
    memo:        value?.memo        || '',
  }))
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const parents = getParentCandidates(allTasks || [], value?.uuid)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setErr('작업 이름을 입력하세요.')
      return
    }
    setErr('')
    setBusy(true)
    try {
      await onSubmit({
        ...form,
        project_uuid: projectUuid,
        parent_uuid:  form.parent_uuid || null,
        start_date:   form.start_date || null,
        end_date:     form.end_date || null,
        progress:     Number(form.progress) || 0,
      })
    } catch (e2) {
      setErr(e2?.message || String(e2))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{isEdit ? '작업 수정' : '새 작업'}</div>
          <button className="modal-close" onClick={onCancel} type="button">✕</button>
        </div>
        <form className="modal-body pm-form" onSubmit={submit}>
          <div className="pm-fg">
            <label>이름 *</label>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="예: 법률검토 — SGI 대위변제"
              required
            />
          </div>

          <div className="pm-form-row">
            <div className="pm-fg">
              <label>담당자</label>
              <input
                value={form.assignee}
                onChange={(e) => set('assignee', e.target.value)}
                placeholder="이름"
              />
            </div>
            <div className="pm-fg">
              <label>상위 작업</label>
              <select
                value={form.parent_uuid || ''}
                onChange={(e) => set('parent_uuid', e.target.value)}
              >
                <option value="">(최상위)</option>
                {parents.map((t) => (
                  <option key={t.uuid} value={t.uuid}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="pm-form-row">
            <div className="pm-fg">
              <label>시작일</label>
              <input type="date" value={form.start_date || ''} onChange={(e) => set('start_date', e.target.value)} />
            </div>
            <div className="pm-fg">
              <label>종료일</label>
              <input type="date" value={form.end_date || ''} onChange={(e) => set('end_date', e.target.value)} />
            </div>
          </div>

          <div className="pm-form-row">
            <div className="pm-fg">
              <label>상태</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="pm-fg">
              <label>우선순위</label>
              <select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="pm-fg">
            <label>진척도 — {form.progress}%</label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={form.progress}
              onChange={(e) => set('progress', Number(e.target.value))}
            />
          </div>

          <div className="pm-fg">
            <label>메모</label>
            <textarea
              rows={4}
              value={form.memo}
              onChange={(e) => set('memo', e.target.value)}
              placeholder="회의록, 결정사항, 진행 노트…"
            />
          </div>

          {err && <div className="pm-error">{err}</div>}

          <div className="modal-foot">
            <button type="button" className="btn-ghost" onClick={onCancel}>취소</button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? '저장 중…' : (isEdit ? '저장' : '만들기')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
