// 백엔드와 같은 출처에서 열린다고 가정하고 상대 경로로만 부른다.
// 개발 때는 vite.config.ts 의 프록시가 FastAPI 로 넘긴다.

export type Health = { status: string; ros_node: string | null }
export type Topics = Record<string, string[]>

export type Grade = '상' | '중'
export type Stats = { 상: number; 중: number; total: number }

export type JudgeRecord = {
  id: number
  grade: Grade
  confidence: number
  v_value: number
  threshold: number
  ts: number
  roll_detected: boolean | null
}

export type StatsResponse = { stats: Stats; cycle_time: number | null; recent: JudgeRecord[] }

export type JudgeMessage =
  | ({ type: 'snapshot' } & StatsResponse)
  | ({ type: 'judge'; bbox: [number, number, number, number] } & Omit<JudgeRecord, 'roll_detected'>)
  | { type: 'stats'; stats: Stats; cycle_time: number | null }
  | { type: 'motion'; approach_speed: number; place_height: number; roll_detected: boolean; ts: number }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
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
  resetStats: () => request<{ stats: Stats }>('/stats/reset', { method: 'POST' }),
}

export function wsUrl(path: string) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}${path}`
}
