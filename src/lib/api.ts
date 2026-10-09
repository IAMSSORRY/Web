// 백엔드와 같은 출처에서 열린다고 가정하고 상대 경로로만 부른다.
// 개발 때는 vite.config.ts 의 프록시가 FastAPI 로 넘긴다.

export type Health = { status: string; camera_source: string; cameras: string[] }
export type Cameras = {
  default: string
  cameras: { name: string; live: boolean; last_frame_age: number | null; error: string | null }[]
}

export type Grade = '상' | '중'
// 하 등급은 아직 서버가 판정하지 않아 키가 없을 수 있다.
export type Stats = { 상: number; 중: number; 하?: number; total: number }

export type JudgeRecord = {
  id: number
  grade: Grade
  confidence: number
  // 근거 수치의 출처가 아직 확정되지 않아 null 이 올 수 있다.
  v_value: number | null
  threshold: number | null
  ts: number
  roll_detected: boolean | null
  // 흠(어두운 영역) 비율. 서버가 보낼 때만 있다. dark_ratio <= dark_max 여야 상이다.
  extra?: { dark_ratio: number; dark_max: number } | null
}

export type MissionStatus = 'idle' | 'running' | 'finished' | 'estop'
export type MissionPhase = 'pick' | 'inspect' | 'place' | 'home'

export type MissionState = {
  status: MissionStatus
  sim: boolean | null
  apple_count: number | null
  apple_index: number | null
  phase: MissionPhase | null
  picks_ok: number
  picks_failed: number
  skipped: number
  // scale: 하강 속도 배율, release_h: 놓는 높이(m), frozen: 자동 조정이 멈춤
  adaptive: { scale: number; release_h: number; frozen: boolean; down_streak: number } | null
  estop_reason: string | null
  started_at: number | null
  ended_at: number | null
  duration_s: number | null
  updated_at: number | null
}

// 이벤트 종류마다 필드가 다르다 (apple: index/total, phase: phase, pick: ok/attempt/width_mm …)
export type MissionEvent = { event: string; ts: number; [field: string]: unknown }

// ok 가 null 이면 서버가 로봇팔을 감시하지 않는 상태(source: "none")다.
export type ArmStatus = {
  source: string
  ok: boolean | null
  message: string | null
  arms: { iface: string; role: string; connected: boolean; responding: boolean | null; state: string; ready: boolean; transport: string }[]
  checked_at: number
}

export type Run = { id: number; started_at: number; ended_at: number | null; stats: Stats }

export type StatsResponse = { stats: Stats; cycle_time: number | null; recent: JudgeRecord[] }

export type JudgeMessage =
  | ({ type: 'snapshot' } & StatsResponse)
  | ({ type: 'judge'; bbox: [number, number, number, number]; cam: string } & Omit<JudgeRecord, 'roll_detected'>)
  | { type: 'stats'; stats: Stats; cycle_time: number | null }
  // 연결 직후에는 event 가 null 이고 현재 상태만 온다.
  | { type: 'mission'; event: MissionEvent | null; state: MissionState }
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
  arm: () => request<ArmStatus>('/arm'),
  mission: (events = 0) => request<{ state: MissionState; events?: MissionEvent[] }>(`/mission?events=${events}`),
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
