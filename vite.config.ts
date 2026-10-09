import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig, loadEnv } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // 백엔드 주소. 다른 PC 의 서버에 붙을 때는 .env.local 에 API_TARGET=http://<서버IP>:8000.
  // 세션 쿠키가 SameSite=Lax 라서 브라우저가 서버 IP 를 직접 부르면 쿠키가 안 붙는다.
  // 그래서 브라우저는 항상 개발 서버(localhost)와만 통신하고, 프록시가 서버로 넘긴다.
  const target = env.API_TARGET ?? 'http://localhost:8000'

  return {
    plugins: [
      react(),
      tailwindcss(),
      babel({ presets: [reactCompilerPreset()] })
    ],
    server: {
      host: true,
      // 백엔드는 /api 접두사 없이 경로를 쓴다. 배포 때는 빌드 결과를 서버가 직접 서빙한다.
      proxy: Object.fromEntries(
        ['/session', '/health', '/cameras', '/stats', '/history', '/runs', '/export.csv', '/arm', '/mission', '/control', '/ws'].map((p) => [
          p,
          { target, ws: p === '/ws', changeOrigin: true },
        ]),
      ),
    },
  }
})
