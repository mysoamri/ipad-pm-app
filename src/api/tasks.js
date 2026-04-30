/**
 * 작업(tasks) CRUD — IndexedDB.
 * 부모-자식 트리 구조: parent_uuid 가 다른 task 의 uuid 또는 null.
 *
 * 규약 (설계문서 §부록 A):
 *  - uuid 'p_<hex>' (작업은 't_<hex>')
 *  - updated_at 모든 변경마다 갱신
 *  - 삭제는 soft (deleted=true); 자손 BFS 도 같이 표식
 */
import { db } from '../db.js'
import { newUuid, nowIso } from './projects.js'

export async function listTasks(projectUuid) {
  const all = await db.tasks.where('project_uuid').equals(projectUuid).toArray()
  return all
    .filter((t) => !t.deleted)
    .sort((a, b) => {
      const oa = a.order_idx ?? 0
      const ob = b.order_idx ?? 0
      if (oa !== ob) return oa - ob
      return String(a.created_at || '').localeCompare(String(b.created_at || ''))
    })
}

export async function getTask(uuid) {
  const t = await db.tasks.get(uuid)
  return t && !t.deleted ? t : null
}

export async function createTask(input) {
  const now = nowIso()
  const task = {
    uuid:         newUuid('t'),
    project_uuid: input.project_uuid,
    parent_uuid:  input.parent_uuid || null,
    name:         input.name,
    assignee:     input.assignee || '',
    start_date:   input.start_date || null,
    end_date:     input.end_date || null,
    status:       input.status || '계획',
    progress:     Number(input.progress ?? 0),
    priority:     input.priority || '중',
    memo:         input.memo || '',
    order_idx:    Number(input.order_idx ?? 0),
    created_at:   now,
    updated_at:   now,
    deleted:      false,
  }
  await db.tasks.add(task)
  return task
}

export async function updateTask(uuid, patch) {
  const allowed = [
    'parent_uuid', 'name', 'assignee', 'start_date', 'end_date',
    'status', 'progress', 'priority', 'memo', 'order_idx',
  ]
  const fields = { updated_at: nowIso() }
  for (const k of allowed) {
    if (patch[k] !== undefined) fields[k] = patch[k]
  }
  if (fields.progress !== undefined) fields.progress = Number(fields.progress)
  if (fields.order_idx !== undefined) fields.order_idx = Number(fields.order_idx)
  await db.tasks.update(uuid, fields)
}

export async function softDeleteTask(uuid) {
  const now = nowIso()
  // BFS 자손 수집 — soft delete 라 해도 화면에서 같이 사라져야 자연스러움.
  const all = await db.tasks.toArray()
  const toMark = new Set([uuid])
  const queue = [uuid]
  while (queue.length) {
    const cur = queue.shift()
    for (const t of all) {
      if (!t.deleted && t.parent_uuid === cur && !toMark.has(t.uuid)) {
        toMark.add(t.uuid)
        queue.push(t.uuid)
      }
    }
  }
  await db.transaction('rw', db.tasks, async () => {
    for (const u of toMark) {
      await db.tasks.update(u, { deleted: true, updated_at: now })
    }
  })
}

/** 같은 부모 아래 형제들의 order_idx 일괄 갱신.
 *  items: [{uuid, order_idx}, ...] */
export async function reorderTasks(items) {
  const now = nowIso()
  await db.transaction('rw', db.tasks, async () => {
    for (const it of items) {
      await db.tasks.update(it.uuid, { order_idx: Number(it.order_idx), updated_at: now })
    }
  })
}

/** 트리 빌드 헬퍼 — 같은 프로젝트의 작업들을 부모-자식 트리 배열로.
 *  반환: [{ ...task, depth, children: [...] }, ...] (preorder DFS, 화면에 들여쓰기로 그리기 용이) */
export function buildTaskTree(tasks) {
  const byParent = new Map()
  for (const t of tasks) {
    const k = t.parent_uuid || '__root__'
    if (!byParent.has(k)) byParent.set(k, [])
    byParent.get(k).push(t)
  }
  const out = []
  function visit(parentKey, depth) {
    const arr = byParent.get(parentKey) || []
    arr.sort((a, b) => (a.order_idx ?? 0) - (b.order_idx ?? 0))
    for (const t of arr) {
      out.push({ ...t, depth })
      visit(t.uuid, depth + 1)
    }
  }
  visit('__root__', 0)
  return out
}

/** 부모 선택지 산출 — 자기 자신과 자기 자손은 부모가 될 수 없다(순환 차단). */
export function getParentCandidates(tasks, selfUuid) {
  // self 의 자손 집합
  const descendants = new Set()
  if (selfUuid) {
    const queue = [selfUuid]
    while (queue.length) {
      const cur = queue.shift()
      for (const t of tasks) {
        if (t.parent_uuid === cur && !descendants.has(t.uuid)) {
          descendants.add(t.uuid)
          queue.push(t.uuid)
        }
      }
    }
  }
  return tasks.filter((t) => t.uuid !== selfUuid && !descendants.has(t.uuid))
}
