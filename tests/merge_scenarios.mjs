/**
 * JS merge() 통합 시나리오 — backend/tests/test_project_sync_scenarios.py 와 1:1 미러.
 * node 로 직접 실행:
 *   node tests/merge_scenarios.mjs
 *
 * 8개 시나리오:
 *   1. 양쪽이 서로 다른 항목 추가 → 둘 다 살아남음
 *   2. 같은 uuid 동시 수정 → 더 늦은 쪽 채택 (LWW)
 *   3. 오프라인 후 합류 → 5건 모두 반영
 *   4. 양쪽 동시 삭제 → deleted=True 1건
 *   5. 삭제 후 맥이 더 늦은 시점에 살림 → undelete 이긴다
 *   6. 31일 전 tombstone → GC
 *   7. 부모 살아있고 자식만 deleted → 둘 다 보존(필터는 화면에서)
 *   8. schema_version 다른 snapshot 도 entities 만 보고 머지 — 미래 호환
 */
import assert from 'node:assert/strict'

// ── sync.js 의 merge 와 동일 알고리즘 (테스트용 사본) ────────────────────
const TOMBSTONE_TTL_MS = 30 * 24 * 3600 * 1000
function parseTs(s) {
  if (!s) return 0
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : 0
}
function merge(a, b) {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS
  const out = { schema_version: 1, saved_at: new Date().toISOString(), saved_by: 'merger' }
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

// ── 헬퍼 ────────────────────────────────────────────────────────────────
const iso = (d) => d.toISOString()
const now = new Date()
const passOf = (n) => `\x1b[32mOK\x1b[0m  scenario ${n}`
const failOf = (n, msg) => `\x1b[31mFAIL\x1b[0m scenario ${n}: ${msg}`

let pass = 0, fail = 0
function run(n, name, fn) {
  try { fn(); console.log(`${passOf(n)} — ${name}`); pass++ }
  catch (e) { console.log(`${failOf(n, e.message)} — ${name}`); fail++ }
}

// ── 1 ──────────────────────────────────────────────────────────────────
run(1, '양쪽이 서로 다른 항목 추가', () => {
  const t = iso(now)
  const a = { projects: [{ uuid: 'p_mac', updated_at: t, deleted: false, name: '맥꺼' }] }
  const b = { projects: [{ uuid: 'p_pad', updated_at: t, deleted: false, name: '패드꺼' }] }
  const m = merge(a, b)
  assert.deepEqual(new Set(m.projects.map(p => p.uuid)), new Set(['p_mac', 'p_pad']))
})

// ── 2 ──────────────────────────────────────────────────────────────────
run(2, '같은 uuid 동시 수정 (LWW)', () => {
  const t0 = iso(now)
  const t1 = iso(new Date(now.getTime() + 10_000))
  const a = { projects: [{ uuid: 'p_1', updated_at: t0, deleted: false, name: '맥수정' }] }
  const b = { projects: [{ uuid: 'p_1', updated_at: t1, deleted: false, name: '패드수정' }] }
  const m = merge(a, b)
  assert.equal(m.projects.length, 1)
  assert.equal(m.projects[0].name, '패드수정')
})

// ── 3 ──────────────────────────────────────────────────────────────────
run(3, '오프라인 후 합류 — 5건 추가', () => {
  const remote = { projects: [], tasks: [], milestones: [] }
  const local = {
    projects: Array.from({ length: 5 }, (_, i) => ({
      uuid: `p_${i}`,
      name: `오프${i}`,
      updated_at: iso(new Date(now.getTime() + i * 1000)),
      created_at: iso(new Date(now.getTime() + i * 1000)),
      deleted: false,
    })),
    tasks: [],
    milestones: [],
  }
  const m = merge(local, remote)
  assert.equal(m.projects.length, 5)
  assert.deepEqual(
    new Set(m.projects.map(p => p.uuid)),
    new Set(['p_0','p_1','p_2','p_3','p_4'])
  )
})

// ── 4 ──────────────────────────────────────────────────────────────────
run(4, '양쪽 동시 삭제', () => {
  const t = iso(now)
  const a = { projects: [{ uuid: 'p_1', updated_at: t, deleted: true, name: 'X' }] }
  const b = { projects: [{ uuid: 'p_1', updated_at: t, deleted: true, name: 'X' }] }
  const m = merge(a, b)
  assert.equal(m.projects.length, 1)
  assert.equal(m.projects[0].deleted, true)
})

// ── 5 ──────────────────────────────────────────────────────────────────
run(5, '삭제 후 맥이 더 늦게 살림 (undelete wins)', () => {
  const t0 = iso(now)
  const t1 = iso(new Date(now.getTime() + 30_000))
  const padDel   = { projects: [{ uuid: 'p_1', updated_at: t0, deleted: true,  name: 'X' }] }
  const macAlive = { projects: [{ uuid: 'p_1', updated_at: t1, deleted: false, name: '다시살림' }] }
  const m = merge(padDel, macAlive)
  assert.equal(m.projects.length, 1)
  assert.equal(m.projects[0].deleted, false)
  assert.equal(m.projects[0].name, '다시살림')
})

// ── 6 ──────────────────────────────────────────────────────────────────
run(6, '31일 전 tombstone — GC', () => {
  const longAgo = iso(new Date(now.getTime() - 31 * 24 * 3600 * 1000))
  const a = { projects: [{ uuid: 'p_1', updated_at: longAgo, deleted: true }] }
  const m = merge(a, { projects: [] })
  assert.equal(m.projects.length, 0)
})

// ── 7 ──────────────────────────────────────────────────────────────────
run(7, '부모 살아있고 자식만 deleted — 둘 다 보존', () => {
  const t = iso(now)
  const snap = {
    projects: [{ uuid: 'p_1', updated_at: t, deleted: false }],
    tasks: [
      { uuid: 't_a', project_uuid: 'p_1', parent_uuid: null,  updated_at: t, deleted: false, name: '부모' },
      { uuid: 't_b', project_uuid: 'p_1', parent_uuid: 't_a', updated_at: t, deleted: true,  name: '자식' },
    ],
    milestones: [],
  }
  // merge 자체는 양쪽 입력 합치는 게 본업이라, 한쪽만 줘도 결과 동일.
  const m = merge(snap, { projects: [], tasks: [], milestones: [] })
  assert.equal(m.tasks.length, 2)
  const child = m.tasks.find(x => x.uuid === 't_b')
  assert.equal(child.deleted, true)
  assert.equal(child.parent_uuid, 't_a')
})

// ── 8 ──────────────────────────────────────────────────────────────────
run(8, 'schema_version 달라도 entities 머지 — 미래 호환', () => {
  const t = iso(now)
  const a = {
    schema_version: 1,
    projects: [{ uuid: 'p_a', updated_at: t, deleted: false }],
  }
  const b = {
    schema_version: 99,
    projects: [{ uuid: 'p_b', updated_at: t, deleted: false }],
  }
  const m = merge(a, b)
  assert.deepEqual(new Set(m.projects.map(p => p.uuid)), new Set(['p_a', 'p_b']))
})

console.log(`---  passed=${pass} failed=${fail}`)
process.exit(fail === 0 ? 0 : 1)
