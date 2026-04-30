/**
 * 프로젝트 CRUD — IndexedDB 직접 호출 (Dexie).
 * 맥의 backend/apis/project.py 와 동등한 의미를 IndexedDB 위에서 구현.
 *
 * 규약 (설계문서 §부록 A 와 일치):
 *  - uuid 가 기본키. 'p_<hex>' 접두사.
 *  - updated_at: ISO8601 UTC (밀리초). 모든 INSERT/UPDATE 마다 갱신.
 *  - deleted: boolean. soft delete. 삭제 시 자식(tasks/milestones) 도 같이 표식.
 *  - 30일 GC 는 sync 워커에서 처리 (5단계).
 */
import { db } from '../db.js'

// ── 유틸 ─────────────────────────────────────────────────────────────────
export function newUuid(prefix) {
  // iOS 16.4+ 의 crypto.randomUUID() 우선, 폴백은 Math.random.
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replaceAll('-', '')
      : Math.random().toString(36).slice(2) + Date.now().toString(36)
  return `${prefix}_${id}`
}

export function nowIso() {
  // toISOString() 자체가 UTC + 'Z' + ms 단위.
  return new Date().toISOString()
}

// ── 프로젝트 ─────────────────────────────────────────────────────────────
export async function listProjects() {
  const all = await db.projects.toArray()
  return all
    .filter((p) => !p.deleted)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
}

export async function getProject(uuid) {
  const p = await db.projects.get(uuid)
  return p && !p.deleted ? p : null
}

export async function createProject(input) {
  const now = nowIso()
  const project = {
    uuid: newUuid('p'),
    name: input.name,
    description: input.description || '',
    start_date: input.start_date || null,
    end_date: input.end_date || null,
    status: input.status || '진행중',
    color: input.color || '#007AFF',
    created_at: now,
    updated_at: now,
    deleted: false,
  }
  await db.projects.add(project)
  return project
}

export async function updateProject(uuid, patch) {
  const fields = {
    updated_at: nowIso(),
    ...(patch.name !== undefined         ? { name: patch.name } : {}),
    ...(patch.description !== undefined  ? { description: patch.description } : {}),
    ...(patch.start_date !== undefined   ? { start_date: patch.start_date } : {}),
    ...(patch.end_date !== undefined     ? { end_date: patch.end_date } : {}),
    ...(patch.status !== undefined       ? { status: patch.status } : {}),
    ...(patch.color !== undefined        ? { color: patch.color } : {}),
  }
  await db.projects.update(uuid, fields)
}

export async function softDeleteProject(uuid) {
  const now = nowIso()
  await db.transaction('rw', db.projects, db.tasks, db.milestones, async () => {
    await db.projects.update(uuid, { deleted: true, updated_at: now })
    const tasks = await db.tasks.where('project_uuid').equals(uuid).toArray()
    for (const t of tasks) {
      if (!t.deleted) await db.tasks.update(t.uuid, { deleted: true, updated_at: now })
    }
    const ms = await db.milestones.where('project_uuid').equals(uuid).toArray()
    for (const m of ms) {
      if (!m.deleted) await db.milestones.update(m.uuid, { deleted: true, updated_at: now })
    }
  })
}

// ── 통계 (목록 카드의 진행률·완료수 등) ─────────────────────────────────
export async function getProjectStats(projectUuid) {
  const tasks = await db.tasks.where('project_uuid').equals(projectUuid).toArray()
  const alive = tasks.filter((t) => !t.deleted)
  const total = alive.length
  if (total === 0) {
    return {
      task_total: 0,
      task_done: 0,
      task_in_progress: 0,
      task_delayed: 0,
      avg_progress: 0,
    }
  }
  let done = 0,
    ip = 0,
    dl = 0,
    sumP = 0
  for (const t of alive) {
    if (t.status === '완료') done++
    else if (t.status === '진행중') ip++
    else if (t.status === '지연') dl++
    sumP += t.progress || 0
  }
  return {
    task_total: total,
    task_done: done,
    task_in_progress: ip,
    task_delayed: dl,
    avg_progress: Math.round(sumP / total),
  }
}
