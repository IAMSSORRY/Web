// 백엔드와 같은 출처에서 열린다고 가정하고 상대 경로로만 부른다.
// 개발 때는 vite.config.ts 의 프록시가 FastAPI 로 넘긴다.

export type Health = { status: string; camera_source: string; cameras: string[] }
export type Cameras = {
  default: string
  cameras: { name: string; live: boolean; last_frame_age: number | null; error: string | null }[]
}

export type Grade = '상' | '중' | '하'
// 서버는 아직 없는 등급도 0 으로 넣어 항상 세 등급 키를 모두 보낸다.
export type Stats = { 상: number; 중: number; 하: number; total: number }

export type JudgeRecord = {
  id: number
  grade: Grade
  confidence: number
  // 근거 수치의 출처가 아직 확정되지 않아 null 이 올 수 있다.
  v_value: number | null
  threshold: number | null
  ts: number
  roll_detected: boolean | null
  // 판정 근거 (서버가 보낼 때만). dark_ratio <= dark_max(흠), bruise_ratio <= bruise_max(멍) 여야 상이다.
  // red_low: 빨강 비율이 이보다 낮으면 하. reasons: 상이 아닌 이유 목록 (상이면 빈 목록).
  extra?: {
    dark_ratio: number
    dark_max: number
    bruise_ratio?: number | null
    bruise_max?: number | null
    red_low?: number
    reasons?: string[]
  } | null
}

// stalled: 진행 중이었는데 로봇 소식이 끊김. 이벤트가 다시 오면 서버가 running 으로 되돌린다.
export type MissionStatus = 'idle' | 'running' | 'stalled' | 'finished' | 'estop'
// nudge: 벽에 붙은 사과를 가운데로 굴리는 중, estop_return / estop_rest: 비상정지 때 사과 되돌리기 / 팔 내리기
export type MissionPhase = 'pick' | 'inspect' | 'place' | 'home' | 'nudge' | 'estop_return' | 'estop_rest'

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

// 로봇 미션 프로그램 상태(GET /control/status 와 모든 제어 응답)
// stopping: 정리 후 정지 진행 중, estopped: 비상정지, error: 오류로 그 자리 정지(힘 이상 등)
export type RobotState = 'idle' | 'running' | 'stopping' | 'estopped' | 'error' | 'done'
export type ControlStatus = {
  ok?: boolean
  message?: string
  state: RobotState
  error: string | null
  index: number | null
  ts: number
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

async function control(path: string, body?: object) {
  const data = await request<{ ok?: boolean; error?: string }>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  if (data.ok === false) throw new Error(data.error ?? '로봇이 명령을 거부했습니다')
  return data
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
  // 로봇 미션 제어. 서버가 로봇 PC 의 미션 프로그램으로 넘긴다.
  // 지금 할 수 없는 명령이면 200 에 {ok:false, error} 로 오므로 본문도 확인한다.
  control: {
    status: () => request<ControlStatus>('/control/status'),
    // "all" 이면 개수 제한 없이 사과가 없을 때까지 한다.
    start: (apples: number | 'all' = 'all') => control('/control/start', { apples }),
    // 지금 사과까지만 하고 멈춘다.
    stop: () => control('/control/stop'),
    // 그 자리에서 즉시 정지하고 모터를 멈춘다(약 0.2초). 팔을 낮추지 않는다. 여러 번 보내도 된다.
    estop: () => control('/control/estop'),
    // 정리 후 정지: 쥔 사과를 되돌리고 팔을 낮게 내린 뒤 비상정지한다. 수 초 걸린다.
    park: () => control('/control/park'),
    // 비상정지(또는 오류 정지) 해제 → 멈춘 사과부터 이어서 한다. 모터를 다시 켜느라 몇 초 걸린다.
    // 로봇이 해제에 실패하면 ok 없이 state 가 그대로 estopped/error 로 올 수 있어 상태로도 판단한다.
    resume: async () => {
      const data = (await control('/control/resume')) as Partial<ControlStatus>
      if (data.state === 'estopped' || data.state === 'error') {
        throw new Error(data.error ?? '로봇이 아직 비상정지 상태입니다')
      }
      return data
    },
  },
}

// 회차를 빼면 전체 회차
export const exportCsvUrl = (run?: number) => (run === undefined ? '/export.csv' : `/export.csv?run=${run}`)

export function wsUrl(path: string) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}${path}`
}
