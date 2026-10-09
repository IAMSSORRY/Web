// 백엔드와 같은 출처에서 열린다고 가정하고 상대 경로로만 부른다.
// 개발 때는 vite.config.ts 의 프록시가 FastAPI 로 넘긴다.

export type Health = { status: string; camera_source: string; cameras: string[] }
export type Cameras = { default: string; cameras: { name: string; live: boolean }[] }

export type Grade = '상' | '중'
export type Stats = { 상: number; 중: number; total: number }

export type JudgeRecord = {
  id: number
  grade: Grade
  confidence: number
  // 근거 수치의 출처가 아직 확정되지 않아 null 이 올 수 있다.
  v_value: number | null
  threshold: number | null
  ts: number
  roll_detected: boolean | null
}

export type Run = { id: number; started_at: number; ended_at: number | null; stats: Stats }

export type StatsResponse = { stats: Stats; cycle_time: number | null; recent: JudgeRecord[] }

export type JudgeMessage =
  | ({ type: 'snapshot' } & StatsResponse)
  | ({ type: 'judge'; bbox: [number, number, number, number]; cam: string } & Omit<JudgeRecord, 'roll_detected'>)
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
  cameras: () => request<Cameras>('/cameras'),
  history: () => request<JudgeRecord[]>('/history'),
  // 최신 회차가 앞에 온다.
  runs: () => request<Run[]>('/runs'),
  resetStats: () => request<{ stats: Stats }>('/stats/reset', { method: 'POST' }),
}

// 회차를 빼면 전체 회차
export const exportCsvUrl = (run?: number) => (run === undefined ? '/export.csv' : `/export.csv?run=${run}`)

export function wsUrl(path: string) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}${path}`
}
