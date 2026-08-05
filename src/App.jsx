/**
 * 메인 — 5개 탭.
 *   프로젝트(기존: 양방향 동기화) + 온투업·업무일지·이미지추출·통합자료실(읽기 전용 조회).
 *
 * 프로젝트 탭은 기존 동작(ProjectList/Detail + SyncBar + 60초 동기화 워커) 그대로.
 * 나머지 4탭은 맥이 Drive 에 백업한 데이터를 받아 조회만 한다.
 *
 * 2026-08-05 레이아웃 수정 —
 *   기존엔 헤더가 그냥 흐르고 탭바만 position:sticky 였다. 그래서 편집 팝업(.modal-overlay,
 *   position:fixed inset:0 z-index:9000)이 뜨면 탭바까지 통째로 덮여 다른 탭으로 못 넘어갔다.
 *   → 헤더+탭바를 하나의 고정 크롬(.app-chrome, z-index 9500)으로 묶고 그 높이를
 *     --chrome-h 로 노출. 모달 오버레이는 top: var(--chrome-h) 부터 깔리므로 탭은 항상 살아있다.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  const chromeRef = useRef(null)

  useEffect(() => {
    getClientId().then(setClientId)
    // 인증되면 60초마다 프로젝트 sync, 인증 안되면 침묵.
    startWorker()
    return () => stopWorker()
  }, [])

  // 고정 크롬의 실제 높이를 CSS 변수로 노출 → main 여백과 모달 오프셋이 같이 따라간다.
  // (아이패드 회전·글꼴 크기 변경에도 자동 반영되도록 ResizeObserver 사용)
  useLayoutEffect(() => {
    const el = chromeRef.current
    if (!el) return
    const apply = () => {
      document.documentElement.style.setProperty('--chrome-h', `${el.offsetHeight}px`)
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    window.addEventListener('orientationchange', apply)
    return () => {
      ro.disconnect()
      window.removeEventListener('orientationchange', apply)
    }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <div className="app-chrome" ref={chromeRef}>
        <header className="app-header">
          <h1>업무 대시보드</h1>
          <div className="sub">단독 모드 · {clientId || '클라이언트 ID 발급 중'}</div>
        </header>

        <nav className="app-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`app-tab ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <main className="app-main">
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
