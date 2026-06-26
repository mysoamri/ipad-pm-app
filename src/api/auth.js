/**
 * Google OAuth — 브라우저 측 Identity Services (implicit token flow).
 *
 * 흐름:
 *  1) GIS 스크립트 로드 후 initTokenClient(client_id, scope)
 *  2) signIn()  : 사용자 클릭 직후 popup 띄움 (consent 한 번)
 *  3) ensureAccessToken() : 만료 가까우면 silent renewal(prompt:'') 시도, 실패 시 사용자 액션 요청
 *
 * 토큰 자체는 메모리 + sessionStorage 임시 저장(새 탭/윈도우 단위 격리). refresh_token 은
 * implicit flow 에서 안 줘서, 사용자가 1시간마다 한 번씩 silent renewal 가 자동으로 갱신.
 * 사파리의 Intelligent Tracking Prevention(ITP) 으로 silent 가 막히면 sign-in 다시 안내.
 */

// drive.file  : 본 앱이 만든 project_db.json 읽기/쓰기 (프로젝트 양방향 동기화)
// drive.readonly : 맥이 만든 다른 기능 파일(온투업/업무일지/OCR/자료실)을 읽기 전용 조회.
//   → 두 scope 를 함께 요청. (scope 추가로 한 번 재동의가 필요할 수 있음)
const SCOPE = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
].join(' ')

// ── 상태 ──────────────────────────────────────────────────────────────
let _tokenClient = null
let _accessToken = null
let _expiresAt = 0      // ms epoch
const _listeners = new Set()

function notify() {
  const s = getAuthState()
  for (const fn of _listeners) {
    try { fn(s) } catch (e) { console.warn('[auth] listener err', e) }
  }
}

export function getAuthState() {
  const valid = !!_accessToken && Date.now() < _expiresAt - 60_000
  return { authenticated: valid, expiresAt: _expiresAt, hasToken: !!_accessToken }
}

export function onAuthChange(fn) {
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}

export function getClientId() {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
}

// ── GIS 로딩 대기 ─────────────────────────────────────────────────────
function waitForGIS(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now()
    const tick = () => {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) {
        return resolve()
      }
      if (Date.now() - t0 > timeoutMs) {
        return reject(new Error('Google Identity Services 가 로드되지 않았습니다'))
      }
      setTimeout(tick, 80)
    }
    tick()
  })
}

async function ensureTokenClient() {
  if (_tokenClient) return _tokenClient
  const cid = getClientId()
  if (!cid) throw new Error('OAuth client_id 미설정 (VITE_GOOGLE_CLIENT_ID)')
  await waitForGIS()
  _tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: cid,
    scope: SCOPE,
    callback: (resp) => {
      if (resp.error) {
        console.warn('[auth] oauth error', resp)
        return
      }
      _accessToken = resp.access_token
      _expiresAt = Date.now() + ((resp.expires_in || 3600) - 30) * 1000
      try {
        // 새 탭/새 세션에 토큰을 그대로 갖고 가지 않게 sessionStorage 만 사용.
        sessionStorage.setItem('ipad-pm-tok', JSON.stringify({
          token: _accessToken, expiresAt: _expiresAt,
        }))
      } catch {}
      notify()
    },
  })
  return _tokenClient
}

// 새로고침 직후 sessionStorage 에 살아 있는 토큰을 가져온다(있다면).
function tryHydrateFromSession() {
  try {
    const raw = sessionStorage.getItem('ipad-pm-tok')
    if (!raw) return false
    const j = JSON.parse(raw)
    if (j?.token && j?.expiresAt && Date.now() < j.expiresAt - 60_000) {
      _accessToken = j.token
      _expiresAt   = j.expiresAt
      return true
    }
  } catch {}
  return false
}
tryHydrateFromSession()

// ── 사용자 액션 ─────────────────────────────────────────────────────────
export async function signIn() {
  const tc = await ensureTokenClient()
  return new Promise((resolve, reject) => {
    const off = onAuthChange((s) => {
      if (s.authenticated) { off(); resolve(s) }
    })
    setTimeout(() => { off(); reject(new Error('OAuth 응답 시간 초과')) }, 60_000)
    tc.requestAccessToken({ prompt: 'consent' })
  })
}

export async function ensureAccessToken() {
  if (_accessToken && Date.now() < _expiresAt - 60_000) return _accessToken
  const tc = await ensureTokenClient()
  return new Promise((resolve, reject) => {
    const off = onAuthChange((s) => {
      if (s.authenticated) { off(); resolve(_accessToken) }
    })
    setTimeout(() => { off(); reject(new Error('토큰 자동 갱신 실패 — 다시 로그인 필요')) }, 8_000)
    // '' (empty string) — silent renewal. 막히면 콜백 안 옴 → timeout.
    tc.requestAccessToken({ prompt: '' })
  })
}

export function signOut() {
  if (window.google?.accounts?.oauth2?.revoke && _accessToken) {
    try {
      window.google.accounts.oauth2.revoke(_accessToken, () => {})
    } catch {}
  }
  _accessToken = null
  _expiresAt = 0
  try { sessionStorage.removeItem('ipad-pm-tok') } catch {}
  notify()
}
