// 개발 서버에서는 /api 가 FastAPI 로 프록시된다 (vite.config.ts).
const BASE = '/api'

export type Health = { status: string; ros_node: string | null }
export type Topics = Record<string, string[]>

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: 'include', ...init })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? `${res.status} ${res.statusText}`)
  }
  return res.json()
}

export const api = {
  // 세션 쿠키 발급용. 웹소켓은 이 쿠키가 없으면 4401 로 닫힌다.
  session: () => request<{ session: string; connections: number }>('/session'),
  health: () => request<Health>('/health'),
  topics: () => request<Topics>('/topics'),
  last: () => request<{ last_message: string | null }>('/last'),
  publish: (text: string) =>
    request<{ published: string }>('/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }),
}

export function wsUrl(path: string) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}${BASE}${path}`
}
