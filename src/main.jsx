import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// ─── service worker 등록 ───────────────────────────────────────────────
// 빌드된 산출물에서만 등록. dev 서버에선 SW 가 캐시 충돌을 일으켜 디버깅이
// 어려우므로 import.meta.env.PROD 만 활성.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    // base path 를 고려해 sw.js 경로를 동적으로.
    const base = import.meta.env.BASE_URL || '/'
    navigator.serviceWorker.register(`${base}sw.js`).catch((err) => {
      console.warn('[sw] 등록 실패:', err)
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
