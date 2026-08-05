/**
 * driveRead — 맥이 Drive 에 백업한 다른 기능 파일들을 "읽기 전용" 으로 가져온다.
 *
 * 기존 drive.js 는 프로젝트(project_db.json) 양방향 동기화용(drive.file).
 * 본 모듈은 drive.readonly scope 로 맥이 만든 파일까지 읽어
 * 온투업 / 업무일지 / 이미지추출(OCR) / 통합자료실 조회에 쓴다.
 *
 * Drive 구조 (맥 백엔드가 push):
 *   dashboard-Backup/
 *     DashboardApp/
 *       ontu/ontu_snapshot.json            (거래처/주요사항/연락처)
 *       journal/journal_snapshot.json      (업무일지 entries)
 *       ocr/ocr.db                         (OCR 히스토리, SQLite)
 *       image_library/image_library.db     (통합자료실 메타, SQLite)
 */
import { ensureAccessToken } from './auth.js'

const BACKUP_ROOT_NAME = 'dashboard-Backup'
const ROOT_NAME = 'DashboardApp'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

// feature → { folder, json|db 파일명 }
export const READ_FEATURES = {
  ontu:          { folder: 'ontu',          json: 'ontu_snapshot.json' },
  journal:       { folder: 'journal',       json: 'journal_snapshot.json' },
  ocr:           { folder: 'ocr',           db:   'ocr.db' },
  image_library: { folder: 'image_library', db:   'image_library.db' },

  // 맥 프론트의 localStorage 전체 스냅샷(ontu_sync.backup_all 이 push).
  // 프로젝트별 주요사항(pm-changes-<id>) · 연락처(pm-contacts-<id>) 가 여기 들어있다.
  // ontu_snapshot.json 은 온투업 3종(companies/changes/contacts)만 담으므로 별도로 읽는다.
  ontu_ls:       { folder: 'ontu',          json: 'ontu_localstorage.json' },
}

let _rootId = null
const _folderCache = {}   // folderName → id

function escQ(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") }

async function authedFetch(url, opts = {}) {
  const token = await ensureAccessToken()
  return fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` },
  })
}

async function safeText(res) { try { return await res.text() } catch { return '' } }

async function findOne({ name, parentId, mimeType }) {
  const parts = [`name='${escQ(name)}'`, 'trashed=false']
  if (mimeType) parts.push(`mimeType='${mimeType}'`)
  if (parentId) parts.push(`'${parentId}' in parents`)
  const q = parts.join(' and ')
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}` +
              `&fields=files(id,name,mimeType,modifiedTime)&pageSize=10`
  const res = await authedFetch(url)
  if (!res.ok) throw new Error(`Drive 검색 실패 (${res.status}): ${await safeText(res)}`)
  const j = await res.json()
  return j.files?.[0] || null
}

/** dashboard-Backup/DashboardApp 앱 루트 폴더 id. 없으면 null. */
async function ensureRoot() {
  if (_rootId) return _rootId
  const backup = await findOne({ name: BACKUP_ROOT_NAME, mimeType: FOLDER_MIME })
  if (!backup) return null
  const f = await findOne({ name: ROOT_NAME, parentId: backup.id, mimeType: FOLDER_MIME })
  if (!f) return null
  _rootId = f.id
  return _rootId
}

async function featureFolderId(folderName) {
  if (_folderCache[folderName]) return _folderCache[folderName]
  const root = await ensureRoot()
  if (!root) return null
  const f = await findOne({ name: folderName, parentId: root, mimeType: FOLDER_MIME })
  if (!f) return null
  _folderCache[folderName] = f.id
  return f.id
}

/** feature 의 JSON 스냅샷을 파싱해 반환. 없으면 null. */
export async function pullFeatureJson(feature) {
  const meta = READ_FEATURES[feature]
  if (!meta?.json) throw new Error(`json feature 아님: ${feature}`)
  const folderId = await featureFolderId(meta.folder)
  if (!folderId) return null
  const f = await findOne({ name: meta.json, parentId: folderId })
  if (!f) return null
  const res = await authedFetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`)
  if (!res.ok) throw new Error(`다운로드 실패 (${res.status}): ${await safeText(res)}`)
  return await res.json()
}

/** feature 의 SQLite(.db) 를 ArrayBuffer 로 반환. 없으면 null. */
export async function pullFeatureDb(feature) {
  const meta = READ_FEATURES[feature]
  if (!meta?.db) throw new Error(`db feature 아님: ${feature}`)
  const folderId = await featureFolderId(meta.folder)
  if (!folderId) return null
  const f = await findOne({ name: meta.db, parentId: folderId })
  if (!f) return null
  const res = await authedFetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`)
  if (!res.ok) throw new Error(`다운로드 실패 (${res.status}): ${await safeText(res)}`)
  return await res.arrayBuffer()
}

/**
 * 맥 프론트의 localStorage 스냅샷을 { key: 파싱된값 } 으로 반환. 없으면 null.
 *
 * 원본 형태: { schema_version, saved_at, saved_by, data: { "<키>": "<JSON 문자열>" } }
 * 값이 JSON 문자열이면 파싱해서, 아니면 원문 그대로 담는다.
 */
export async function pullMacLocalStorage() {
  const raw = await pullFeatureJson('ontu_ls')
  if (!raw) return null
  const data = raw.data || {}
  const out = {}
  for (const [k, v] of Object.entries(data)) {
    if (typeof v !== 'string') { out[k] = v; continue }
    try { out[k] = JSON.parse(v) } catch { out[k] = v }
  }
  return { savedAt: raw.saved_at || null, data: out }
}

/** 캐시 초기화(루트/폴더 id) — 새로고침 강제 시. */
export function resetDriveReadCache() {
  _rootId = null
  for (const k of Object.keys(_folderCache)) delete _folderCache[k]
}
