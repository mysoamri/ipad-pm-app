// 아이패드 프로젝트 일정관리 PWA — service worker
//
// 캐시 전략 (단순화):
// - 정적 자원(html/js/css/svg/manifest): cache-first, 새 빌드 배포 시 SW 자체가 새 버전이
//   로드되어 install 이벤트의 새 캐시 이름으로 다시 채운다. 활성화 단계에서 옛 캐시 제거.
// - Google Drive API 요청 등 외부 호출: 네트워크 직통(캐시 우회). PWA 내부 fetch 만 캐시 적용.
//
// 빌드 해시 기반 캐시 무효화는 vite 가 자산 파일명에 hash 를 붙이므로,
// 새 빌드 = 새 자산 URL 이라 자동으로 옛 캐시가 비활성화된다. CACHE_NAME 만 빌드마다
// 갈아끼우면 안전.

// v3 — Drive 경로/스코프 교정, 온투업 상세 표시, 탭바 가림 수정, 프로젝트 주요사항 탭 추가.
// v4 — 좌우 여백 축소(아이패드 가로 화면 폭 활용).
const CACHE_NAME = 'ipad-pm-shell-v4'
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.svg',
  './icon-512.svg',
]

self.addEventListener('install', (event) => {
  // 새 SW 즉시 활성화 — 옛 SW 가 다음 새로고침까지 살아있어서 사용자가 옛 화면을 보는 시간을 줄임.
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(SHELL_FILES).catch((err) => {
        // shell 일부가 없어도 install 자체는 실패 안 시킴 — dev 모드 등에서 일부 자원 부재 대응
        console.warn('[sw] shell precache 일부 실패:', err)
      })
    )
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k.startsWith('ipad-pm-')).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // 동일 출처(즉, PWA 자체 자원) 만 캐시 활용. Drive API 등 외부는 네트워크 직통.
  if (url.origin !== self.location.origin) return

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit
      return fetch(req)
        .then((res) => {
          // 성공한 GET 만 즉석 캐시(런타임)
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone()
            caches.open(CACHE_NAME).then((c) => c.put(req, clone))
          }
          return res
        })
        .catch(() => caches.match('./index.html')) // 오프라인 + shell 폴백
    })
  )
})

// 앱에서 'SKIP_WAITING' 메시지 보내면 즉시 새 SW 활성화 (업데이트 알림 시 사용)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
