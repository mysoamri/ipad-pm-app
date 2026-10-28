/**
 * 동기화 상태바 — 헤더 아래 1행.
 *
 * 표시:
 *  - 인증 상태 (●/○)
 *  - 마지막 sync 시각 + 결과(첫 푸시 / 머지)
 *  - 진행 중 회전 표시
 *  - 마지막 에러 (있을 때만)
 *
 * 액션:
 *  - 미인증: 'Google 로그인'
 *  - 인증됨: '지금 동기화' / '로그아웃'
 *
 * Drive 폴링 워커는 App.jsx 가 startWorker() 로 띄우고, 본 컴포넌트는 결과만 읽음.
 */
import { useEffect, useState } from 'react'
import { getAuthState, onAuthChange, signIn, signOut, getClientId } from '../api/auth.js'
import { syncOnce, getSyncMeta } from '../api/sync.js'

export default function SyncBar() {
  const [auth, setAuth] = useState(getAuthState())
  const [meta, setMeta] = useState({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg]   = useState('')
  const [err, setErr]   = useState('')

  // sync 결과를 자주 갱신 — 워커가 백그라운드로 도는 동안 UI 도 따라 갱신됨
  useEffect(() => {
    const off = onAuthChange((s) => setAuth(s))
    let alive = true
    const tick = async () => {
      if (!alive) return
      setMeta(await getSyncMeta())
    }
    tick()
    const id = setInterval(tick, 5000)
    return () => { alive = false; clearInterval(id); off() }
  }, [])

  const cid = getClientId()

  const onLogin = async () => {
    setErr(''); setMsg('')
    setBusy(true)
    try {
      await signIn()
      setMsg('로그인 완료 — 첫 동기화 진행 중…')
    } catch (e) {
      setErr(e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const onLogout = () => {
    signOut()
    setMsg('로그아웃됨')
  }

  const onSync = async () => {
    setErr(''); setMsg('')
    setBusy(true)
    try {
      const r = await syncOnce()
      setMeta(await getSyncMeta())
      if (r.ok) {
        const dir = r.direction === 'first-push' ? '드라이브 첫 업로드' : '양방향 머지'
        setMsg(`${dir} 완료 · ${r.applied || 0}건 반영 · ${r.elapsedMs}ms`)
      } else {
        setErr(r.error)
      }
    } catch (e) {
      setErr(e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!cid) {
    return (
      <div style={s.banner.warn}>
        ⚠️ Google OAuth Client ID 미설정 — <code>VITE_GOOGLE_CLIENT_ID</code> 환경변수가 비어 있습니다.
        설정 후 dev 서버 재기동 또는 빌드를 다시 하면 동기화 기능이 활성화됩니다.
        지금은 로컬 단독 모드로 동작합니다.
      </div>
    )
  }

  return (
    <div style={s.bar}>
      <div style={s.left}>
        {auth.authenticated ? (
          <>
            <span style={s.dot.ok}>●</span>
            <span style={s.label}>Drive 연결됨</span>
            {meta.lastSyncAt ? (
              <span style={s.meta}>
                {meta.lastSyncOk ? '마지막 동기화' : '마지막 시도(실패)'}: {fmtTime(meta.lastSyncAt)}
                {meta.direction === 'first-push' && ' · 첫 업로드'}
                {meta.direction === 'merged' && typeof meta.applied === 'number' && ` · ${meta.applied}건 반영`}
              </span>
            ) : (
              <span style={s.meta}>로그인 직후 자동 동기화 중…</span>
            )}
          </>
        ) : (
          <>
            <span style={s.dot.off}>○</span>
            <span style={s.label}>Drive 미연결</span>
            <span style={s.meta}>로그인하면 다른 기기와 자동 동기화됩니다</span>
          </>
        )}
      </div>
      <div style={s.right}>
        {auth.authenticated ? (
          <>
            <button className="btn-ghost" onClick={onSync} disabled={busy}>
              {busy ? '동기화 중…' : '지금 동기화'}
            </button>
            <button className="btn-ghost" onClick={onLogout} disabled={busy}>로그아웃</button>
          </>
        ) : (
          <button className="btn-primary" onClick={onLogin} disabled={busy}>
            {busy ? '여는 중…' : 'Google 로그인'}
          </button>
        )}
      </div>
      {(msg || err || meta.lastError) && (
        <div style={err ? s.banner.err : (meta.lastSyncOk === false ? s.banner.err : s.banner.info)}>
          {err || msg || (meta.lastSyncOk === false ? `최근 오류: ${meta.lastError}` : '')}
        </div>
      )}
    </div>
  )
}

function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const s = {
  bar: {
    background: '#fff',
    borderBottom: '1px solid #E2E8F0',
    padding: '8px 12px',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  left:  { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 },
  right: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
  label: { fontSize: '0.88rem', fontWeight: 600, color: '#1A202C' },
  meta:  { fontSize: '0.78rem', color: '#718096' },
  dot: {
    ok:  { color: '#48BB78', fontSize: '0.9rem' },
    off: { color: '#A0AEC0', fontSize: '0.9rem' },
  },
  banner: {
    warn: {
      width: '100%',
      background: '#FEF5C9', color: '#744210',
      padding: '8px 12px', borderRadius: 8,
      fontSize: '0.83rem', lineHeight: 1.5,
      margin: '6px 0',
    },
    err: {
      width: '100%',
      background: '#FFF5F5', color: '#C53030',
      padding: '8px 12px', borderRadius: 8,
      fontSize: '0.83rem',
      margin: '6px 0',
    },
    info: {
      width: '100%',
      background: '#EBF8FF', color: '#2C5282',
      padding: '8px 12px', borderRadius: 8,
      fontSize: '0.83rem',
      margin: '6px 0',
    },
  },
}
