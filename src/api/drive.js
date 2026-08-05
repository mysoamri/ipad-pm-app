/**
 * Google Drive REST 호출 — drive.file scope.
 * 본 앱이 만든 파일과 폴더만 보이고, 사용자의 다른 Drive 자료에는 접근 불가.
 *
 * 폴더 트리:
 *   <my-drive>/
 *     dashboard-Backup/
 *       DashboardApp/
 *         pm/
 *           project_db.json    ← 동기화 파일
 *
 * 5단계 1차: 폴더 보장 + project_db.json 다운/업로드 헬퍼만. 실 sync 사이클은 sync.js.
 */
import { ensureAccessToken } from './auth.js'

const BACKUP_ROOT_NAME = 'dashboard-Backup'
const FOLDER_NAME    = 'DashboardApp'
const PM_SUBFOLDER   = 'pm'
const SNAPSHOT_FILE  = 'project_db.json'
const FOLDER_MIME    = 'application/vnd.google-apps.folder'

async function authedFetch(url, opts = {}) {
  const token = await ensureAccessToken()
  return fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  })
}

function escQ(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function findOne({ name, parentId, mimeType }) {
  const parts = [
    `name='${escQ(name)}'`,
    'trashed=false',
  ]
  if (mimeType) parts.push(`mimeType='${mimeType}'`)
  if (parentId) parts.push(`'${parentId}' in parents`)
  else parts.push("'root' in parents")

  const q = parts.join(' and ')
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}` +
              `&fields=files(id,name,mimeType,modifiedTime)&pageSize=10`
  const res = await authedFetch(url)
  if (!res.ok) {
    const t = await safeText(res)
    throw new Error(`drive list 실패 (${res.status}): ${t}`)
  }
  const j = await res.json()
  return j.files?.[0] || null
}

async function safeText(res) {
  try { return await res.text() } catch { return '' }
}

async function ensureFolder(name, parentId) {
  const existing = await findOne({ name, parentId, mimeType: FOLDER_MIME })
  if (existing) return existing.id
  const body = {
    name,
    mimeType: FOLDER_MIME,
    parents: parentId ? [parentId] : ['root'],
  }
  const res = await authedFetch(
    'https://www.googleapis.com/drive/v3/files?fields=id,name',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
  if (!res.ok) {
    const t = await safeText(res)
    throw new Error(`drive folder create 실패 (${res.status}): ${t}`)
  }
  const j = await res.json()
  return j.id
}

/** dashboard-Backup/DashboardApp/pm/ 폴더 보장. folder id 반환. */
export async function ensurePmFolder() {
  const backup = await ensureFolder(BACKUP_ROOT_NAME, null)
  const root   = await ensureFolder(FOLDER_NAME, backup)
  const pm     = await ensureFolder(PM_SUBFOLDER, root)
  return pm
}

/** project_db.json 다운로드. 없으면 null. */
export async function pullSnapshot() {
  const pmId = await ensurePmFolder()
  const f = await findOne({ name: SNAPSHOT_FILE, parentId: pmId })
  if (!f) return { snapshot: null, fileId: null, modifiedTime: null }
  const url = `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`
  const res = await authedFetch(url)
  if (!res.ok) {
    const t = await safeText(res)
    throw new Error(`drive download 실패 (${res.status}): ${t}`)
  }
  const snap = await res.json()
  return { snapshot: snap, fileId: f.id, modifiedTime: f.modifiedTime }
}

/** project_db.json 업로드/갱신. 새 파일이면 multipart 로 생성. */
export async function pushSnapshot(snap) {
  const pmId = await ensurePmFolder()
  const existing = await findOne({ name: SNAPSHOT_FILE, parentId: pmId })
  const body = JSON.stringify(snap, null, 2)

  if (existing) {
    const url = `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`
    const res = await authedFetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    if (!res.ok) {
      const t = await safeText(res)
      throw new Error(`drive update 실패 (${res.status}): ${t}`)
    }
    return { fileId: existing.id, created: false }
  }

  // 새 생성 — multipart/related (메타데이터 + 본문)
  const boundary = 'pm-' + Math.random().toString(36).slice(2)
  const meta = { name: SNAPSHOT_FILE, parents: [pmId] }
  const multipart =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(meta) + '\r\n' +
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    body + '\r\n' +
    `--${boundary}--\r\n`

  const res = await authedFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipart,
    }
  )
  if (!res.ok) {
    const t = await safeText(res)
    throw new Error(`drive create 실패 (${res.status}): ${t}`)
  }
  const j = await res.json()
  return { fileId: j.id, created: true }
}
