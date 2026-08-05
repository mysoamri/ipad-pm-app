/**
 * 주요사항 카드 — 온투업 탭과 프로젝트 상세의 "주요사항" 탭이 함께 쓴다.
 *
 * 맥 대시보드의 항목 스키마 (localStorage ontu-wk-changes / pm-changes-<projectId>):
 *   { id, date, category, title, content, status, expectedDate,
 *     isMeeting, isReport, isSubmit, attachments[], tags[], starred, pinned,
 *     contentBlocks[{ id, type, text, checked, isOpen, detailsText }],
 *     companyId }        ← 온투업 항목만
 *
 * 기존 ReadOnlyViews 의 범용 렌더러는 content·title 을 "메타 필드"로 분류해 걸러버려서
 * 제목과 날짜만 보이고 본문이 통째로 사라졌다. 이 카드는 스키마를 직접 알고 그린다.
 */
import { useState } from 'react'

export function statusTone(s) {
  switch (s) {
    case '완료':     return 'green'
    case '진행중':   return 'blue'
    case '진행예정': return 'yellow'
    case '보류':     return 'gray'
    case '중단':     return 'red'
    default:         return 'gray'
  }
}

export function parseList(v) {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') {
    try { const a = JSON.parse(v); return Array.isArray(a) ? a : [] } catch { return [] }
  }
  return []
}

/** 연락처 카드 — { name, org, dept, role, tel, phone, email, notes } */
export function ContactCard({ item }) {
  const lines = [
    item.tel && ['전화', item.tel],
    item.phone && ['휴대폰', item.phone],
    item.email && ['이메일', item.email],
  ].filter(Boolean)
  return (
    <div style={{
      background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 14,
      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: 15.5, color: '#1A202C' }}>{item.name || '(이름 없음)'}</span>
        {item.role && <span className="badge gray">{item.role}</span>}
      </div>
      <div style={{ marginTop: 4, fontSize: 13, color: '#718096' }}>
        {[item.org, item.dept].filter(Boolean).join(' · ') || '—'}
      </div>
      {lines.length > 0 && (
        <div style={{ marginTop: 8, display: 'grid', gap: 3 }}>
          {lines.map(([k, v]) => (
            <div key={k} style={{ fontSize: 14, color: '#2D3748' }}>
              <span style={{ color: '#A0AEC0', marginRight: 6 }}>{k}</span>
              {k === '이메일'
                ? <a href={`mailto:${v}`} style={{ color: '#007AFF', textDecoration: 'none' }}>{v}</a>
                : <a href={`tel:${String(v).replace(/[^0-9+]/g, '')}`} style={{ color: '#007AFF', textDecoration: 'none' }}>{v}</a>}
            </div>
          ))}
        </div>
      )}
      {item.notes && (
        <div style={{ marginTop: 8, fontSize: 13.5, color: '#4A5568', whiteSpace: 'pre-wrap' }}>{item.notes}</div>
      )}
    </div>
  )
}

/** 거래처 카드 — 기본정보 + 수수료표(접기) */
export function CompanyCard({ item }) {
  const [open, setOpen] = useState(false)
  const rows = parseList(item.feeRows)
  const fields = [
    ['사업자번호', item.bizno],
    ['대표', item.rep],
    ['등록일', item.license],
    ['주소', item.address],
    ['연락처', item.phone],
    ['계좌/이메일', item.email],
    ['수수료 청구', item.feeBilling],
  ].filter(([, v]) => v)

  return (
    <div style={{
      background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 14,
      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    }}>
      <div style={{ fontWeight: 700, fontSize: 16, color: '#1A202C' }}>{item.name || '(이름 없음)'}</div>
      {fields.length > 0 && (
        <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
          {fields.map(([k, v]) => (
            <div key={k} style={{ fontSize: 13.5, color: '#2D3748', display: 'flex', gap: 8 }}>
              <span style={{ flex: '0 0 84px', color: '#A0AEC0' }}>{k}</span>
              <span style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{v}</span>
            </div>
          ))}
        </div>
      )}
      {item.notes && (
        <div style={{ marginTop: 8, fontSize: 13.5, color: '#4A5568', whiteSpace: 'pre-wrap' }}>{item.notes}</div>
      )}
      {rows.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button className="btn-ghost" onClick={() => setOpen((v) => !v)}
            style={{ fontSize: 13, padding: '5px 12px', minHeight: 0 }}>
            {open ? '수수료 접기' : `수수료 ${rows.length}행 보기`}
          </button>
          {open && (
            <div style={{ marginTop: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 12.5, minWidth: 460, width: '100%' }}>
                <thead>
                  <tr style={{ background: '#F7FAFC', color: '#4A5568' }}>
                    {['구분', '방식', '기준', '적용', '비고'].map((h) => (
                      <th key={h} style={{ border: '1px solid #E2E8F0', padding: '6px 8px', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id || i}>
                      {[r.group, r.method, r.std, r.applied, r.note].map((c, j) => (
                        <td key={j} style={{ border: '1px solid #E2E8F0', padding: '6px 8px', color: '#2D3748', whiteSpace: 'pre-wrap' }}>{c ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** 본문 블록(체크리스트/접이식 상세) 렌더 */
function Blocks({ list }) {
  const [open, setOpen] = useState({})
  if (!list.length) return null
  return (
    <div style={{ marginTop: 8, display: 'grid', gap: 5 }}>
      {list.map((b, i) => {
        const text = (b?.text || '').trim()
        if (!text) return null
        const hasDetails = !!(b?.detailsText || '').trim()
        const isOpen = open[b.id ?? i]
        return (
          <div key={b.id ?? i} style={{ fontSize: 14.5, lineHeight: 1.55, color: '#2D3748' }}>
            <div
              onClick={hasDetails ? () => setOpen((o) => ({ ...o, [b.id ?? i]: !isOpen })) : undefined}
              style={{
                display: 'flex', gap: 7, alignItems: 'flex-start',
                cursor: hasDetails ? 'pointer' : 'default',
              }}
            >
              <span style={{ flex: '0 0 auto', color: b.checked ? '#38A169' : '#CBD5E0', marginTop: 1 }}>
                {b.checked ? '☑' : '·'}
              </span>
              <span style={{
                flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                textDecoration: b.checked ? 'line-through' : 'none',
                opacity: b.checked ? 0.6 : 1,
              }}>{text}</span>
              {hasDetails && (
                <span style={{ flex: '0 0 auto', color: '#A0AEC0', fontSize: 12 }}>{isOpen ? '▾' : '▸'}</span>
              )}
            </div>
            {hasDetails && isOpen && (
              <div style={{
                margin: '4px 0 2px 20px', padding: '8px 10px', background: '#F7FAFC',
                border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13.5,
                color: '#4A5568', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>{b.detailsText}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * @param {object}  item      주요사항 항목
 * @param {string}  company   거래처명(온투업 탭에서만; 없으면 미표시)
 * @param {boolean} collapsed true 면 접힌 상태로 시작(본문은 탭해서 펼침)
 */
export default function ChangeCard({ item, company, collapsed = true }) {
  const [open, setOpen] = useState(!collapsed)

  const blocks = parseList(item.contentBlocks)
  const tags = parseList(item.tags)
  const atts = parseList(item.attachments)
  const content = (item.content || '').trim()
  const hasBody = !!content || blocks.length > 0 || atts.length > 0

  const flags = [
    item.isMeeting && '회의',
    item.isReport && '보고',
    item.isSubmit && '제출',
  ].filter(Boolean)

  return (
    <div style={{
      background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 14,
      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      borderLeft: item.pinned ? '4px solid #007AFF' : '1px solid #E2E8F0',
    }}>
      {/* 제목 줄 */}
      <div
        onClick={hasBody ? () => setOpen((v) => !v) : undefined}
        style={{ cursor: hasBody ? 'pointer' : 'default' }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 15.5, color: '#1A202C', lineHeight: 1.4 }}>
            {item.starred && <span style={{ marginRight: 4 }}>★</span>}
            {(item.title || '').trim() || '(제목 없음)'}
          </div>
          {hasBody && (
            <span style={{ flex: '0 0 auto', color: '#A0AEC0', fontSize: 13, marginTop: 2 }}>
              {open ? '▾' : '▸'}
            </span>
          )}
        </div>

        {/* 배지 줄 */}
        <div style={{ marginTop: 7, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {item.status && <span className={`badge ${statusTone(item.status)}`}>{item.status}</span>}
          {item.category && <span className="badge gray">{item.category}</span>}
          {company && <span className="badge blue">{company}</span>}
          {flags.map((f) => (
            <span key={f} className="badge yellow" style={{ fontSize: 11 }}>{f}</span>
          ))}
        </div>

        {/* 날짜 줄 */}
        <div style={{ marginTop: 6, fontSize: 12.5, color: '#718096' }}>
          {[
            item.date && `등록 ${item.date}`,
            item.expectedDate && `예정 ${item.expectedDate}`,
            atts.length > 0 && `첨부 ${atts.length}건`,
          ].filter(Boolean).join(' · ') || '—'}
        </div>
      </div>

      {/* 본문 */}
      {open && hasBody && (
        <div style={{ marginTop: 10, borderTop: '1px solid #EDF2F7', paddingTop: 10 }}>
          {blocks.length > 0 ? (
            <Blocks list={blocks} />
          ) : content ? (
            <div style={{
              fontSize: 14.5, lineHeight: 1.6, color: '#2D3748',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>{content}</div>
          ) : null}

          {/* contentBlocks 가 있어도 원문 content 가 더 길면 함께 보여준다(정보 손실 방지) */}
          {blocks.length > 0 && content && content.length > blocks.map((b) => b.text || '').join('\n').length + 10 && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ fontSize: 12.5, color: '#718096', cursor: 'pointer' }}>원문 전체 보기</summary>
              <div style={{
                marginTop: 6, fontSize: 14, lineHeight: 1.6, color: '#4A5568',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>{content}</div>
            </details>
          )}

          {atts.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 12.5, color: '#718096' }}>
              📎 첨부 {atts.length}건 — 파일 본문은 맥 대시보드에서 확인
            </div>
          )}
        </div>
      )}

      {tags.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tags.map((t, i) => (
            <span key={i} className="badge blue" style={{ fontSize: 11 }}>#{typeof t === 'string' ? t : t?.name || ''}</span>
          ))}
        </div>
      )}
    </div>
  )
}
