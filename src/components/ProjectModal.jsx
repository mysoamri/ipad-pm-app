/**
 * 프로젝트 추가/수정 모달.
 * value=null  → 추가 모드
 * value=객체  → 수정 모드 (uuid 보존)
 */
import { useEffect, useState } from 'react'

const COLORS = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#5AC8FA', '#FF2D92', '#8E8E93']
const STATUSES = ['진행중', '완료', '보류', '계획']

export default function ProjectModal({ value, onSubmit, onCancel }) {
  const isEdit = !!value
  const [form, setForm] = useState(() => ({
    name:        value?.name        || '',
    description: value?.description || '',
    start_date:  value?.start_date  || '',
    end_date:    value?.end_date    || '',
    status:      value?.status      || '진행중',
    color:       value?.color       || '#007AFF',
  }))
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')

  // 모달 떠 있을 때 body 스크롤 잠금 — iOS Safari 가 모달 뒤를 같이 스크롤하는 현상 방지
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setErr('프로젝트 이름을 입력하세요.')
      return
    }
    setErr('')
    setBusy(true)
    try {
      await onSubmit({
        ...form,
        start_date: form.start_date || null,
        end_date:   form.end_date   || null,
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
          <div className="modal-title">{isEdit ? '프로젝트 수정' : '새 프로젝트'}</div>
          <button className="modal-close" onClick={onCancel} type="button">✕</button>
        </div>
        <form className="modal-body pm-form" onSubmit={submit}>
          <div className="pm-fg">
            <label>이름 *</label>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="예: 온투업 보고서 자동화"
              required
            />
          </div>

          <div className="pm-fg">
            <label>설명</label>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
              placeholder="간단한 한 줄 설명"
            />
          </div>

          <div className="pm-form-row">
            <div className="pm-fg">
              <label>시작일</label>
              <input
                type="date"
                value={form.start_date || ''}
                onChange={(e) => set('start_date', e.target.value)}
              />
            </div>
            <div className="pm-fg">
              <label>종료일</label>
              <input
                type="date"
                value={form.end_date || ''}
                onChange={(e) => set('end_date', e.target.value)}
              />
            </div>
          </div>

          <div className="pm-fg">
            <label>상태</label>
            <select
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="pm-fg">
            <label>색상</label>
            <div className="color-picker">
              {COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`color-dot ${c === form.color ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => set('color', c)}
                  aria-label={`색상 ${c}`}
                />
              ))}
            </div>
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
