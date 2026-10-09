import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig, loadEnv } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // FastAPI 서버 주소. 세션 쿠키를 웹소켓까지 그대로 쓰려면 같은 출처여야 해서 프록시로 붙인다.
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
        ['/session', '/health', '/cameras', '/stats', '/history', '/ws'].map((p) => [
          p,
          { target, ws: p === '/ws', changeOrigin: true },
        ]),
      ),
    },
  }
})
