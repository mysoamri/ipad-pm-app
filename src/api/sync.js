/**
 * 동기화 사이클 — 양방향 머지.
 * 설계 문서: docs/IPAD_PM_DESIGN.md §부록 B 와 1:1 대응.
 *
 * 흐름:
 *   syncOnce()
 *     ├─ pullSnapshot()              Drive 의 project_db.json 다운로드 (없으면 null)
 *     ├─ remote 가 null 이면 → 로컬을 첫 push (로컬 권위)
 *     └─ remote 가 있으면:
 *         ├─ snapshotLocal()         IndexedDB → snapshot dict
 *         ├─ merge(local, remote)    uuid 단위 last-write-wins, 30일 GC
 *         ├─ applySnapshot(merged)   IndexedDB 에 upsert (로컬 newer 면 skip)
 *         └─ pushSnapshot(merged)    Drive 로 다시 올림 (로컬 변경 포함)
 *
 * 폴링: 60초 주기. 인증 안 된 동안엔 침묵.
 */
import { db, getClientId } from '../db.js'
import { getAuthState, onAuthChange } from './auth.js'
import { pullSnapshot, pushSnapshot, ensurePmFolder } from './drive.js'

const SCHEMA_VERSION   = 1
const TOMBSTONE_TTL_MS = 30 * 24 * 3600 * 1000  // 30일
const POLL_INTERVAL    = 60 * 1000              // 60초

// ── 시간 파서 (관대) ─────────────────────────────────────────────────────
function parseTs(s) {
  if (!s) return 0
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : 0
}

// ── snapshot 직렬화 ──────────────────────────────────────────────────────
async function snapshotLocal() {
  const cid = await getClientId()
  const [projects, tasks, milestones] = await Promise.all([
    db.projects.toArray(),
    db.tasks.toArray(),
    db.milestones.toArray(),
  ])
  return {
    schema_version: SCHEMA_VERSION,
    saved_at: new Date().toISOString(),
    saved_by: cid,
    projects:   projects.map(normalize),
    tasks:      tasks.map(normalize),
    milestones: milestones.map(normalize),
  }
}

function normalize(e) {
  // _stats 같은 임시 필드 제외, deleted 는 boolean 명시
  const { _stats, _depth, ...rest } = e
  return { ...rest, deleted: !!rest.deleted }
}

// ── 머지 (last-write-wins + 30일 tombstone GC) ──────────────────────────
export function merge(a, b) {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS
  const out = {
    schema_version: SCHEMA_VERSION,
    saved_at: new Date().toISOString(),
    saved_by: 'merger',
  }
  for (const kind of ['projects', 'tasks', 'milestones']) {
    const map = new Map()
    for (const arr of [a?.[kind] || [], b?.[kind] || []]) {
      for (const e of arr) {
        if (!e?.uuid) continue
        const cur = map.get(e.uuid)
        if (!cur || parseTs(e.updated_at) >= parseTs(cur.updated_at)) {
          map.set(e.uuid, e)
        }
      }
    }
    out[kind] = [...map.values()].filter(
      (e) => !(e.deleted && parseTs(e.updated_at) < cutoff)
    )
  }
  return out
}

// ── snapshot → IndexedDB 적용 ────────────────────────────────────────────
async function applySnapshot(snap) {
  let applied = 0
  await db.transaction('rw', db.projects, db.tasks, db.milestones, async () => {
    for (const e of (snap.projects || []))   applied += await upsert('projects', e)
    for (const e of (snap.tasks || []))      applied += await upsert('tasks', e)
    for (const e of (snap.milestones || [])) applied += await upsert('milestones', e)
    // 30일 GC — 본체 영구 삭제
    const cutoff = Date.now() - TOMBSTONE_TTL_MS
    for (const t of ['projects', 'tasks', 'milestones']) {
      const all = await db[t].toArray()
      for (const e of all) {
        if (e.deleted && parseTs(e.updated_at) < cutoff) {
          await db[t].delete(e.uuid)
        }
      }
    }
  })
  return applied
}

async function upsert(table, e) {
  if (!e?.uuid) return 0
  const existing = await db[table].get(e.uuid)
  if (existing) {
    if (parseTs(e.updated_at) <= parseTs(existing.updated_at)) {
      return 0  // 로컬이 더 새거나 같음 — 그대로 둠
    }
    await db[table].put({ ...e, deleted: !!e.deleted })
  } else {
    await db[table].put({ ...e, deleted: !!e.deleted })
  }
  return 1
}

// ── meta(=lastSyncAt 등) ────────────────────────────────────────────────
export async function getSyncMeta() {
  const row = await db.meta.get('sync_state')
  return row?.value || {}
}

async function setSyncMeta(patch) {
  const cur = (await db.meta.get('sync_state'))?.value || {}
  await db.meta.put({ key: 'sync_state', value: { ...cur, ...patch } })
}

// ── 한 사이클 ────────────────────────────────────────────────────────────
let _running = false
export async function syncOnce() {
  if (_running) return { ok: false, error: 'already running' }
  _running = true
  const t0 = Date.now()
  try {
    await ensurePmFolder()  // 첫 사용 시 폴더 보장
    const { snapshot: remote } = await pullSnapshot()
    const local = await snapshotLocal()

    if (!remote) {
      // 첫 푸시 — 드라이브가 비어있을 때.
      await pushSnapshot(local)
      await setSyncMeta({
        lastSyncAt: new Date().toISOString(),
        lastSyncOk: true,
        direction: 'first-push',
        applied: 0,
        elapsedMs: Date.now() - t0,
        lastError: null,
      })
      return { ok: true, direction: 'first-push', elapsedMs: Date.now() - t0 }
    }

    const merged = merge(local, remote)
    const applied = await applySnapshot(merged)
    // 머지된 결과를 다시 Drive 로 푸시 — 로컬에만 있던 변경분이 함께 반영됨
    await pushSnapshot(merged)

    await setSyncMeta({
      lastSyncAt: new Date().toISOString(),
      lastSyncOk: true,
      direction: 'merged',
      applied,
      elapsedMs: Date.now() - t0,
      lastError: null,
    })
    return { ok: true, direction: 'merged', applied, elapsedMs: Date.now() - t0 }
  } catch (e) {
    await setSyncMeta({
      lastSyncAt: new Date().toISOString(),
      lastSyncOk: false,
      lastError: String(e?.message || e),
    })
    return { ok: false, error: String(e?.message || e), elapsedMs: Date.now() - t0 }
  } finally {
    _running = false
  }
}

// ── 폴링 워커 ────────────────────────────────────────────────────────────
let _interval = null
let _authOff  = null

export function startWorker() {
  if (_interval) return
  // 인증 변경 시 즉시 한 번 sync (첫 로그인 직후)
  _authOff = onAuthChange((s) => {
    if (s.authenticated) syncOnce().catch(() => {})
  })
  _interval = setInterval(() => {
    if (getAuthState().authenticated) {
      syncOnce().catch(() => {})
    }
  }, POLL_INTERVAL)
}

export function stopWorker() {
  if (_interval) { clearInterval(_interval); _interval = null }
  if (_authOff)  { _authOff(); _authOff = null }
}
