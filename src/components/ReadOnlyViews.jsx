/**
 * 읽기 전용 조회 뷰 4종 — 온투업 / 업무일지 / 이미지추출(OCR) / 통합자료실.
 *
 * 데이터: 맥이 Drive(DashboardApp/<feature>/) 에 백업한 파일을 drive.readonly 로 받아옴.
 *   - ontu / journal : JSON 스냅샷 (driveRead.pullFeatureJson)
 *   - ocr / image_library : SQLite(.db) → sql.js 로 SELECT (driveRead.pullFeatureDb)
 *
 * 편집·동기화는 하지 않는다(조회 전용).
 */
import { useEffect, useState, useCallback } from 'react'
import { pullFeatureJson, pullFeatureDb, resetDriveReadCache } from '../api/driveRead.js'
import { openDb, selectAll, hasTable } from '../api/sqlite.js'

// ── 공통 ──────────────────────────────────────────────────────────────────
function Refresh({ busy, onClick }) {
  return (
    <button className="btn-ghost" onClick={onClick} disabled={busy}
      style={{ fontSize: 13, padding: '5px 12px' }}>
      {busy ? '불러오는 중…' : '↻ 새로고침'}
    </button>
  )
}
function Bar({ title, count, busy, onRefresh }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      gap: 10, margin: '4px 2px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 19, color: '#1A202C' }}>{title}</h2>
        {count != null && <span style={{ fontSize: 13, color: '#718096' }}>총 {count}개</span>}
      </div>
      <Refresh busy={busy} onClick={onRefresh} />
    </div>
  )
}
function Err({ children }) {
  return <div className="pm-error" style={{ margin: '8px 2px' }}>{children}</div>
}
function Empty({ children }) {
  return <div style={{ color: '#718096', padding: '12px 2px', fontSize: 15 }}>{children}</div>
}
function Card({ children, style }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12,
      padding: 14, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', ...style }}>{children}</div>
  )
}
function Tags({ list }) {
  if (!list || !list.length) return null
  return (
    <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {list.map((t) => <span key={t} className="badge blue" style={{ fontSize: 11 }}>#{t}</span>)}
    </div>
  )
}
function parseTags(v) {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') { try { const a = JSON.parse(v); return Array.isArray(a) ? a : [] } catch { return [] } }
  return []
}

const META = new Set(['uuid', 'updated_at', 'created_at', 'deleted', 'id', 'rag_optout',
  'title', 'name', 'content', 'text', 'tags', 'pinned', 'done', 'done_at'])
function pickLabel(r) {
  for (const k of ['title', 'name', 'company', 'company_name', 'subject', 'content', 'text', 'memo']) {
    if (r && typeof r[k] === 'string' && r[k].trim()) return r[k].trim()
  }
  return '(제목 없음)'
}
function subFields(r) {
  const out = []
  for (const [k, v] of Object.entries(r || {})) {
    if (META.has(k) || v == null || v === '' || typeof v === 'object') continue
    out.push(`${k}: ${v}`)
    if (out.length >= 4) break
  }
  return out.join(' · ')
}

// JSON 스냅샷 로더 훅
function useJson(feature) {
  const [snap, setSnap] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const load = useCallback(async (force) => {
    setBusy(true); setErr('')
    try {
      if (force) resetDriveReadCache()
      const s = await pullFeatureJson(feature)
      setSnap(s || {})
    } catch (e) { setErr(String(e.message || e)) }
    finally { setBusy(false) }
  }, [feature])
  useEffect(() => { load(false) }, [load])
  return { snap, busy, err, reload: () => load(true) }
}
function rows(snap, key) {
  return ((snap && snap[key]) || []).filter((r) => !r.deleted)
}

// .db 로더 훅
function useDb(feature, query) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const load = useCallback(async (force) => {
    setBusy(true); setErr('')
    try {
      if (force) resetDriveReadCache()
      const buf = await pullFeatureDb(feature)
      if (!buf) { setData([]); return }
      const db = await openDb(buf)
      try { setData(query(db)) } finally { db.close() }
    } catch (e) { setErr(String(e.message || e)) }
    finally { setBusy(false) }
  }, [feature, query])
  useEffect(() => { load(false) }, [load])
  return { data, busy, err, reload: () => load(true) }
}

// ── 온투업 ──────────────────────────────────────────────────────────────────
export function OntuView() {
  const { snap, busy, err, reload } = useJson('ontu')
  const companies = rows(snap, 'companies')
  const changes = rows(snap, 'changes')
  const contacts = rows(snap, 'contacts')
  const total = companies.length + changes.length + contacts.length

  const Group = ({ title, list }) => (
    <div style={{ marginBottom: 18 }}>
      <h3 style={{ margin: '0 0 8px 2px', fontSize: 15, color: '#2D3748' }}>{title} <span style={{ color: '#A0AEC0', fontWeight: 400 }}>{list.length}</span></h3>
      {list.length === 0 ? <Empty>없음</Empty> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {list.slice(0, 80).map((r, i) => (
            <Card key={r.uuid || i}>
              <div style={{ fontWeight: 600, color: '#1A202C' }}>{pickLabel(r)}</div>
              <div style={{ fontSize: 12.5, color: '#718096', marginTop: 4 }}>{subFields(r) || '—'}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div style={{ padding: '4px 14px 40px' }}>
      <Bar title="온투업 업무" count={total} busy={busy} onRefresh={reload} />
      {err && <Err>{err}</Err>}
      {snap === null && busy && <Empty>불러오는 중…</Empty>}
      {snap !== null && (
        <>
          <Group title="거래처" list={companies} />
          <Group title="주요사항" list={changes} />
          <Group title="연락처" list={contacts} />
        </>
      )}
    </div>
  )
}

// ── 업무일지 ──────────────────────────────────────────────────────────────────
export function JournalView() {
  const { snap, busy, err, reload } = useJson('journal')
  const [q, setQ] = useState('')
  let entries = rows(snap, 'entries')
  entries.sort((a, b) => `${b.date || ''} ${b.time || ''}`.localeCompare(`${a.date || ''} ${a.time || ''}`))
  if (q.trim()) {
    const k = q.trim().toLowerCase()
    entries = entries.filter((e) => `${e.content || ''} ${e.date || ''} ${parseTags(e.tags).join(' ')}`.toLowerCase().includes(k))
  }
  return (
    <div style={{ padding: '4px 14px 40px' }}>
      <Bar title="업무일지" count={entries.length} busy={busy} onRefresh={reload} />
      {err && <Err>{err}</Err>}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="업무일지 검색…"
        style={{ width: '100%', boxSizing: 'border-box', marginBottom: 12, fontSize: 15,
          padding: '9px 12px', border: '1px solid #CBD5E0', borderRadius: 10 }} />
      {snap === null && busy && <Empty>불러오는 중…</Empty>}
      {snap !== null && entries.length === 0 && <Empty>기록이 없습니다.</Empty>}
      <div style={{ display: 'grid', gap: 8 }}>
        {entries.slice(0, 200).map((e, i) => (
          <Card key={e.uuid || i} style={{ opacity: e.done ? 0.6 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 12.5, color: '#718096' }}>{e.date} {e.time}</span>
              {e.done ? <span className="badge green" style={{ fontSize: 11 }}>완료</span>
                : e.pinned ? <span style={{ fontSize: 12 }}>📌</span> : null}
            </div>
            <div style={{ color: '#1A202C', marginTop: 4, fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{e.content}</div>
            <Tags list={parseTags(e.tags)} />
          </Card>
        ))}
      </div>
    </div>
  )
}

// ── 이미지추출 (OCR) ──────────────────────────────────────────────────────────
const ocrQuery = (db) => {
  if (!hasTable(db, 'ocr_runs')) return []
  return selectAll(db, `SELECT id, title, source_name, page_count, char_count, text, created_at
    FROM ocr_runs ORDER BY created_at DESC`)
}
export function OcrView() {
  const { data, busy, err, reload } = useDb('ocr', ocrQuery)
  const [open, setOpen] = useState(null)
  return (
    <div style={{ padding: '4px 14px 40px' }}>
      <Bar title="이미지추출" count={data ? data.length : null} busy={busy} onRefresh={reload} />
      {err && <Err>{err}</Err>}
      {data === null && <Empty>불러오는 중…</Empty>}
      {data && data.length === 0 && <Empty>추출 기록이 없습니다.</Empty>}
      <div style={{ display: 'grid', gap: 8 }}>
        {(data || []).map((r) => {
          const isOpen = open === r.id
          return (
            <Card key={r.id}>
              <div onClick={() => setOpen(isOpen ? null : r.id)} style={{ cursor: 'pointer' }}>
                <div style={{ fontWeight: 600, color: '#1A202C' }}>{r.title || r.source_name || '(제목 없음)'}</div>
                <div style={{ fontSize: 12.5, color: '#718096', marginTop: 4 }}>
                  {[`${r.page_count}p`, `${r.char_count}자`, r.created_at].filter(Boolean).join(' · ')}
                </div>
              </div>
              {isOpen && r.text && (
                <pre style={{ marginTop: 10, padding: 10, background: '#F7FAFC', borderRadius: 8,
                  border: '1px solid #E2E8F0', color: '#1A202C', fontSize: 13, whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word', maxHeight: 360, overflow: 'auto', fontFamily: 'inherit' }}>{r.text}</pre>
              )}
              {!isOpen && r.text && <div style={{ fontSize: 12, color: '#A0AEC0', marginTop: 6 }}>탭하면 전체 텍스트 보기</div>}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ── 통합자료실 ────────────────────────────────────────────────────────────────
const libQuery = (db) => {
  if (!hasTable(db, 'images')) return []
  return selectAll(db, `SELECT id, file_name, width, height, bytes, title, description,
    tags, source, ocr_text, created_at FROM images ORDER BY created_at DESC`)
}
export function LibraryView() {
  const { data, busy, err, reload } = useDb('image_library', libQuery)
  const [q, setQ] = useState('')
  let list = data || []
  if (q.trim()) {
    const k = q.trim().toLowerCase()
    list = list.filter((r) => `${r.title || ''} ${r.file_name || ''} ${r.ocr_text || ''} ${parseTags(r.tags).join(' ')}`.toLowerCase().includes(k))
  }
  return (
    <div style={{ padding: '4px 14px 40px' }}>
      <Bar title="통합자료실" count={data ? list.length : null} busy={busy} onRefresh={reload} />
      {err && <Err>{err}</Err>}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="자료 검색(제목·태그·OCR)…"
        style={{ width: '100%', boxSizing: 'border-box', marginBottom: 8, fontSize: 15,
          padding: '9px 12px', border: '1px solid #CBD5E0', borderRadius: 10 }} />
      <div style={{ fontSize: 11.5, color: '#A0AEC0', margin: '0 2px 10px', lineHeight: 1.5 }}>
        ※ 메타정보·태그·OCR 텍스트만 표시됩니다(원본 이미지 미리보기는 추후).
      </div>
      {data === null && <Empty>불러오는 중…</Empty>}
      {data && list.length === 0 && <Empty>자료가 없습니다.</Empty>}
      <div style={{ display: 'grid', gap: 8 }}>
        {list.slice(0, 200).map((r) => (
          <Card key={r.id}>
            <div style={{ fontWeight: 600, color: '#1A202C' }}>{r.title || r.file_name || '(제목 없음)'}</div>
            <div style={{ fontSize: 12.5, color: '#718096', marginTop: 4 }}>
              {[r.file_name, r.width && r.height && `${r.width}×${r.height}`,
                r.bytes && `${(r.bytes / 1024).toFixed(0)}KB`, r.source, r.created_at].filter(Boolean).join(' · ')}
            </div>
            {r.description && <div style={{ fontSize: 14, color: '#2D3748', marginTop: 6 }}>{r.description}</div>}
            {r.ocr_text && <div style={{ fontSize: 12.5, color: '#718096', marginTop: 6, maxHeight: 80, overflow: 'hidden' }}>{r.ocr_text}</div>}
            <Tags list={parseTags(r.tags)} />
          </Card>
        ))}
      </div>
    </div>
  )
}
