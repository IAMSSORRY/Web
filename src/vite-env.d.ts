/// <reference types="vite/client" />

interface ImportMetaEnv {
  // 백엔드 주소. 비우면 같은 출처(개발 서버 프록시)로 부른다.
  readonly VITE_API_BASE?: string
}
