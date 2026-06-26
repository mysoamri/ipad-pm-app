/**
 * 메인 — 5개 탭.
 *   프로젝트(기존: 양방향 동기화) + 온투업·업무일지·이미지추출·통합자료실(읽기 전용 조회).
 *
 * 프로젝트 탭은 기존 동작(ProjectList/Detail + SyncBar + 60초 동기화 워커) 그대로.
 * 나머지 4탭은 맥이 Drive 에 백업한 데이터를 drive.readonly 로 받아 조회만 한다.
 */
import { useEffect, useState } from 'react'
import { getClientId } from './db.js'
import ProjectList from './components/ProjectList.jsx'
import ProjectDetail from './components/ProjectDetail.jsx'
import SyncBar from './components/SyncBar.jsx'
import { OntuView, JournalView, OcrView, LibraryView } from './components/ReadOnlyViews.jsx'
import { startWorker, stopWorker } from './api/sync.js'
import './styles/pm.css'

const TABS = [
  { key: 'project', label: '프로젝트' },
  { key: 'ontu', label: '온투업' },
  { key: 'journal', label: '업무일지' },
  { key: 'ocr', label: '이미지추출' },
  { key: 'library', label: '통합자료실' },
]

export default function App() {
  const [clientId, setClientId] = useState('')
  const [tab, setTab] = useState('project')
  const [openedUuid, setOpenedUuid] = useState(null)

  useEffect(() => {
    getClientId().then(setClientId)
    // 인증되면 60초마다 프로젝트 sync, 인증 안되면 침묵.
    startWorker()
    return () => stopWorker()
  }, [])

  return (
    <div className="safe-padding" style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <header className="app-header">
        <h1>업무 대시보드</h1>
        <div className="sub">단독 모드 · {clientId || '클라이언트 ID 발급 중'}</div>
      </header>

      {/* 탭 바 */}
      <nav style={{
        display: 'flex', gap: 6, padding: '8px 12px', overflowX: 'auto',
        background: '#F7FAFC', borderBottom: '1px solid #E2E8F0',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: '0 0 auto', fontSize: 14, padding: '7px 14px', borderRadius: 999,
            border: '1px solid #CBD5E0', cursor: 'pointer', whiteSpace: 'nowrap',
            background: tab === t.key ? '#007AFF' : '#fff',
            color: tab === t.key ? '#fff' : '#2D3748',
            fontWeight: tab === t.key ? 700 : 500,
          }}>{t.label}</button>
        ))}
      </nav>

      <main style={{ flex: 1 }}>
        {tab === 'project' && (
          <>
            <SyncBar />
            {openedUuid ? (
              <ProjectDetail projectUuid={openedUuid} onBack={() => setOpenedUuid(null)} />
            ) : (
              <ProjectList onOpen={(p) => setOpenedUuid(p.uuid)} />
            )}
          </>
        )}
        {tab === 'ontu' && <OntuView />}
        {tab === 'journal' && <JournalView />}
        {tab === 'ocr' && <OcrView />}
        {tab === 'library' && <LibraryView />}
      </main>
    </div>
  )
}
