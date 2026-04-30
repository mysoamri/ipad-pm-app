/**
 * 마일스톤 추가/수정 모달.
 */
import { useEffect, useState } from 'react'

const STATUSES = ['예정', '달성', '지연']

export default function MilestoneModal({ value, projectUuid, onSubmit, onCancel }) {
  const isEdit = !!value
  const [form, setForm] = useState(() => ({
    name:     value?.name     || '',
    due_date: value?.due_date || '',
    status:   value?.status   || '예정',
    memo:     value?.memo     || '',
  }))
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setErr('이름을 입력하세요.'); return }
    if (!form.due_date)    { setErr('마감일을 선택하세요.'); return }
    setErr('')
    setBusy(true)
    try {
      await onSubmit({
        ...form,
        project_uuid: projectUuid,
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
          <div className="modal-title">{isEdit ? '마일스톤 수정' : '새 마일스톤'}</div>
          <button className="modal-close" onClick={onCancel} type="button">✕</button>
        </div>
        <form className="modal-body pm-form" onSubmit={submit}>
          <div className="pm-fg">
            <label>이름 *</label>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="예: 1차 보고"
              required
            />
          </div>

          <div className="pm-form-row">
            <div className="pm-fg">
              <label>마감일 *</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => set('due_date', e.target.value)}
                required
              />
            </div>
            <div className="pm-fg">
              <label>상태</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="pm-fg">
            <label>메모</label>
            <textarea
              rows={3}
              value={form.memo}
              onChange={(e) => set('memo', e.target.value)}
              placeholder="비고"
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
