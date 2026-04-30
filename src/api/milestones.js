/**
 * 마일스톤(milestones) CRUD — IndexedDB.
 * uuid 'm_<hex>' 접두사. parent 없음, due_date 가 핵심 인덱스.
 */
import { db } from '../db.js'
import { newUuid, nowIso } from './projects.js'

export async function listMilestones(projectUuid) {
  const all = await db.milestones.where('project_uuid').equals(projectUuid).toArray()
  return all
    .filter((m) => !m.deleted)
    .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')))
}

export async function getMilestone(uuid) {
  const m = await db.milestones.get(uuid)
  return m && !m.deleted ? m : null
}

export async function createMilestone(input) {
  const now = nowIso()
  if (!input.due_date) throw new Error('마감일은 필수입니다.')
  const ms = {
    uuid:         newUuid('m'),
    project_uuid: input.project_uuid,
    name:         input.name,
    due_date:     input.due_date,
    status:       input.status || '예정',
    memo:         input.memo || '',
    created_at:   now,
    updated_at:   now,
    deleted:      false,
  }
  await db.milestones.add(ms)
  return ms
}

export async function updateMilestone(uuid, patch) {
  const allowed = ['name', 'due_date', 'status', 'memo']
  const fields = { updated_at: nowIso() }
  for (const k of allowed) {
    if (patch[k] !== undefined) fields[k] = patch[k]
  }
  await db.milestones.update(uuid, fields)
}

export async function softDeleteMilestone(uuid) {
  await db.milestones.update(uuid, { deleted: true, updated_at: nowIso() })
}
