/**
 * IndexedDB 스키마 — 설계문서(docs/IPAD_PM_DESIGN.md) 의 snapshot 형식과
 * 1:1 대응. 모든 동기 대상 엔티티는 uuid 가 기본키.
 *
 * Dexie v4 — `stores()` 의 인덱스 표기에서 첫 항목이 primary key.
 */
import Dexie from 'dexie'

export const db = new Dexie('ipad-pm')

// IndexedDB 인덱스는 boolean 값을 지원하지 않으므로 deleted 는 인덱스에서 제외하고
// 메모리에서 .filter(x => !x.deleted) 로 거른다. 데이터 규모(수십~수백 행) 상 충분.
db.version(1).stores({
  // 동기화 대상 3 종
  projects:   'uuid, updated_at',
  tasks:      'uuid, project_uuid, parent_uuid, updated_at',
  milestones: 'uuid, project_uuid, due_date, updated_at',

  // key/value — 클라이언트 고유 식별자, 마지막 sync 시각, OAuth 토큰(나중에) 등
  meta: 'key',
})

/** ─── 클라이언트 식별자 ──────────────────────────────────────────────
 *  맥은 'mac' 고정, 아이패드는 첫 실행 시 랜덤 생성 후 IndexedDB 에 저장.
 *  설계문서 §부록 A 의 saved_by 필드용.
 */
export async function getClientId() {
  const row = await db.meta.get('client_id')
  if (row?.value) return row.value
  const id = 'ipad-' + Math.random().toString(36).slice(2, 10)
  await db.meta.put({ key: 'client_id', value: id })
  return id
}

/** 디버깅용 — 모든 테이블 비우기. UI 의 "초기화" 버튼에서만 부르도록. */
export async function resetAll() {
  await db.transaction('rw', db.projects, db.tasks, db.milestones, db.meta, async () => {
    await db.projects.clear()
    await db.tasks.clear()
    await db.milestones.clear()
    await db.meta.clear()
  })
}
