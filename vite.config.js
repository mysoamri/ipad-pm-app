import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 호스팅 시 보통 https://<user>.github.io/<repo>/ 경로에 올라가므로
// base 를 같이 맞춰주어야 PWA 의 정적 자원(manifest, sw, icons)이 정상 해석된다.
// 환경변수 VITE_BASE_PATH 로 덮어쓸 수 있게 — 로컬 개발 시 '/' 그대로.
const base = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5174,   // 맥 dashboard 의 5173/3000 과 충돌 안 나게 분리
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
