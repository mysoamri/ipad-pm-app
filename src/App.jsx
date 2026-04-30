/**
 * 4단계 — 프로젝트 목록 화면.
 *
 * 다음 묶음에서 ProjectDetail 추가 (작업 목록 / 마일스톤 / WBS / 메모).
 * 지금은 카드 클릭 시 콘솔 로그 + 임시 메시지만 띄움.
 */
import { useEffect, useState } from 'react'
import { getClientId } from './db.js'
import ProjectList from './components/ProjectList.jsx'
import ProjectDetail from './components/ProjectDetail.jsx'
import SyncBar from './components/SyncBar.jsx'
import { startWorker, stopWorker } from './api/sync.js'
import './styles/pm.css'

export default function App() {
  const [clientId, setClientId] = useState('')
  const [openedUuid, setOpenedUuid] = useState(null)

  useEffect(() => {
    getClientId().then(setClientId)
    // 인증되면 60초마다 sync, 인증 안되면 침묵.
    startWorker()
    return () => stopWorker()
  }, [])

  return (
    <div className="safe-padding" style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <header className="app-header">
        <h1>프로젝트 일정관리</h1>
        <div className="sub">단독 모드 · {clientId || '클라이언트 ID 발급 중'}</div>
      </header>
      <SyncBar />

      <main style={{ flex: 1 }}>
        {openedUuid ? (
          <ProjectDetail
            projectUuid={openedUuid}
            onBack={() => setOpenedUuid(null)}
          />
        ) : (
          <ProjectList onOpen={(p) => setOpenedUuid(p.uuid)} />
        )}
      </main>
    </div>
  )
}
