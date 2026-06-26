/**
 * sql.js (WASM SQLite) 래퍼 — Drive 에서 받은 .db(ArrayBuffer) 를 메모리에서 SELECT.
 *
 * wasm 은 vite 의 ?url import 로 번들 자산 URL 을 받아 locateFile 에 넘긴다
 * (GitHub Pages 의 base path 까지 자동 반영).
 */
import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

let _SQLPromise = null

function getSQL() {
  if (!_SQLPromise) {
    _SQLPromise = initSqlJs({ locateFile: () => wasmUrl })
  }
  return _SQLPromise
}

/** ArrayBuffer → sql.js Database. */
export async function openDb(arrayBuffer) {
  const SQL = await getSQL()
  return new SQL.Database(new Uint8Array(arrayBuffer))
}

/** SELECT 결과를 [{col:val,...}] 로 반환. */
export function selectAll(db, sql, params = []) {
  const stmt = db.prepare(sql)
  try {
    if (params.length) stmt.bind(params)
    const rows = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    return rows
  } finally {
    stmt.free()
  }
}

/** 테이블 존재 여부. */
export function hasTable(db, name) {
  const rows = selectAll(
    db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    [name],
  )
  return rows.length > 0
}
