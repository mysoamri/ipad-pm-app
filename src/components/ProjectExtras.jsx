/**
 * 프로젝트 상세 — "주요사항 / 연락처" (읽기 전용).
 *
 * 맥 대시보드는 프로젝트별 주요사항·연락처를 SQLite 가 아니라 프론트 localStorage 에
 * 프로젝트 정수 id 로 키를 나눠 담는다.
 *      pm-changes-<projectId>   주요사항
 *      pm-contacts-<projectId>  연락처
 * 이 값들은 project_db.json 에는 없고, 맥이 Drive 로 올리는 localStorage 전체 스냅샷
 *      dashboard-Backup/DashboardApp/ontu/ontu_localstorage.json
 * 안에 들어있다. 그래서 프로젝트 동기화와는 별도로 그 파일을 읽어 붙인다.
 *
 * 프로젝트 uuid ↔ 맥의 정수 id 를 잇는 값이 project_db.json 의 local_id 다
 * (맥 backend/modules/project_sync.py 의 snapshot_local 이 넣어준다).
 * 맥이 아직 갱신된 스냅샷을 올리지 않았으면 local_id 가 없어 매칭이 안 되므로,
 * 그때는 안내 문구를 띄운다.
 */
import { useCallback, useEffect, useState } from 'react'
import { pullMacLocalStorage, resetDriveReadCache } from '../api/driveRead.js'
import ChangeCard, { ContactCard } from './ChangeCard.jsx'
import { SubTabs } from './ReadOnlyViews.jsx'

const SECTIONS = [
  { key: 'changes',  label: '주요사항' },
  { key: 'contacts', label: '연락처' },
]

function asArray(v) {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') {
    try { const a = JSON.parse(v); return Array.isArray(a) ? a : [] } catch { return [] }
  }
  return []
}

export default function ProjectExtras({ project }) {
  const [snap, setSnap] = useState(null)   // { savedAt, data }
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sec, setSec] = useState('changes')
  const [q, setQ] = useState('')

  const load = useCallback(async (force) => {
    setBusy(true); setErr('')
    try {
      if (force) resetDriveReadCache()
      setSnap(await pullMacLocalStorage() || { savedAt: null, data: {} })
    } catch (e) { setErr(String(e.message || e)) }
    finally { setBusy(false) }
  }, [])

  useEffect(() => { load(false) }, [load])

  const localId = project?.local_id
  const data = snap?.data || {}
  const changes  = localId == null ? [] : asArray(data[`pm-changes-${localId}`])
  const contacts = localId == null ? [] : asArray(data[`pm-contacts-${localId}`])

  const match = (r) => {
    const k = q.trim().toLowerCase()
    return !k || JSON.stringify(r).toLowerCase().includes(k)
  }
  const changeList = changes.filter(match).sort((a, b) => {
    if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1
    return String(b.date || '').localeCompare(String(a.date || ''))
  })
  const contactList = contacts.filter(match)
  const counts = { changes: changeList.length, contacts: contactList.length }
  const list = sec === 'changes' ? changeList : contactList

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <SubTabs value={sec} onChange={setSec} items={SECTIONS.map((s) => ({ ...s, count: counts[s.key] }))} />
        <button className="btn-ghost" onClick={() => load(true)} disabled={busy}
          style={{ flex: '0 0 auto', fontSize: 13, padding: '5px 12px', minHeight: 34 }}>
          {busy ? '불러오는 중…' : '↻ 새로고침'}
        </button>
      </div>

      {err && <div className="pm-error" style={{ margin: '8px 0' }}>{err}</div>}

      {snap && localId == null && (
        <div style={{
          background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10,
          padding: 12, fontSize: 13.5, color: '#78350F', lineHeight: 1.6, marginBottom: 10,
        }}>
          이 프로젝트에 맥의 내부 번호(local_id)가 없어 주요사항을 이어붙이지 못했습니다.
          맥 업무 대시보드를 재시작해 프로젝트 스냅샷이 한 번 다시 올라가면 표시됩니다.
        </div>
      )}

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목·본문·담당자 검색…"
        style={{ width: '100%', boxSizing: 'border-box', marginBottom: 12, fontSize: 15,
          padding: '9px 12px', border: '1px solid #CBD5E0', borderRadius: 10 }} />

      {snap === null && <div style={{ color: '#718096', fontSize: 15 }}>불러오는 중…</div>}

      {snap !== null && list.length === 0 && localId != null && (
        <div style={{ color: '#718096', fontSize: 15, padding: '12px 2px' }}>
          {sec === 'changes' ? '주요사항이 없습니다.' : '연락처가 없습니다.'}
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {sec === 'changes'
          ? changeList.map((r, i) => <ChangeCard key={r.id || i} item={r} />)
          : contactList.map((r, i) => <ContactCard key={r.id || i} item={r} />)}
      </div>

      <div style={{ marginTop: 14, fontSize: 11.5, color: '#A0AEC0', lineHeight: 1.6 }}>
        ※ 조회 전용입니다. 편집은 맥 업무 대시보드에서 하세요.
        {snap?.savedAt && <> · 맥 백업 시각 {String(snap.savedAt).replace('T', ' ').slice(0, 16)}</>}
      </div>
    </div>
  )
}
