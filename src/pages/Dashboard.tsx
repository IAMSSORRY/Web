import { useEffect, useRef, useState } from 'react'
import DashboardHeader, { type Connection } from '../components/DashboardHeader'
import Toaster from '../components/Toaster'
import { useCameraStream, type Detection } from '../hooks/useCameraStream'
import { useJudgeStream, type LiveJudge } from '../hooks/useJudgeStream'
import { api, exportCsvUrl, type Advice, type ArmStatus, type Cameras, type MissionEvent, type MissionPhase, type MissionState, type RobotState, type ControlStatus, type Grade, type Run, type Stats } from '../lib/api'
import { downloadServerCsv, formatTs, saveCsv } from '../lib/csv'
import { detectApples } from '../lib/detect'
import { polite } from '../lib/polite'
import { toast } from '../lib/toast'
import { countJudges, loadJudges, saveJudges } from '../lib/localdb'

const POLL_MS = 2000

const gradeText: Record<Grade, string> = {
  상: 'text-grade-high',
  중: 'text-grade-mid',
  하: 'text-grade-low',
}
const gradeBorder: Record<Grade, string> = {
  상: 'border-grade-high',
  중: 'border-grade-mid',
  하: 'border-grade-low',
}

const timeFmt = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const fmtTime = (ts: number) => timeFmt.format(ts * 1000)
const pct = (n: number) => `${(n * 100).toFixed(1)}%`
// 비율(0~1)은 소수 둘째 자리, 그보다 큰 값(예: 0~255)은 정수로
const num = (n: number) => (Math.abs(n) <= 1 ? n.toFixed(2) : String(Math.round(n)))

// /cameras 응답으로 카메라 목록과 카메라별 프레임 수신 여부를 본다.
// undefined: 아직 첫 응답 전, null: 서버 응답 없음
function useCameras() {
  const [cameras, setCameras] = useState<Cameras | null | undefined>(undefined)

  useEffect(() => {
    let alive = true
    const tick = () =>
      api
        .cameras()
        .then((d) => alive && setCameras(d))
        .catch(() => alive && setCameras(null))
    tick()
    const id = setInterval(tick, POLL_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  return cameras
}

const ARM_POLL_MS = 3000

// 로봇팔 상태. 요청이 실패하면 서버 쪽 문제라서 여기서는 null 로 두고 서버 끊김으로 처리한다.
function useArm() {
  const [arm, setArm] = useState<ArmStatus | null>(null)

  useEffect(() => {
    let alive = true
    const tick = () =>
      api
        .arm()
        .then((d) => alive && setArm(d))
        .catch(() => alive && setArm(null))
    tick()
    const id = setInterval(tick, ARM_POLL_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  return arm
}

// 로봇 미션 프로그램 상태. 꺼져 있거나 서버가 못 닿으면 null 이고, 그 이유(서버 detail)를 error 에 둔다.
function useControlStatus() {
  const [status, setStatus] = useState<ControlStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const tick = () =>
      api.control
        .status()
        .then((d) => alive && (setStatus(d), setError(null)))
        .catch((e: Error) => alive && (setStatus(null), setError(e.message)))
    tick()
    const id = setInterval(tick, POLL_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  return { status, error }
}

function Section({ id, title, right, children }: { id: string; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-semibold lg:text-[32px]">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

function Card({ title, right, children, className = '' }: { title?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative flex flex-col overflow-hidden rounded-xl border border-border bg-main-3 shadow-card ${className}`}>
      {title && (
        <div className="flex items-center gap-2 px-5 pt-6">
          <h3 className="text-xl font-semibold">{title}</h3>
          {right}
        </div>
      )}
      {children}
    </div>
  )
}

// alert: 카메라 다운처럼 사용자가 알아야 하는 상태는 디자인의 흐린 색보다 밝게 보인다.
function Unavailable({ text, detail, alert = false }: { text: string; detail?: string; alert?: boolean }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 px-10 text-center">
      <img src="/warn.svg" alt="" className="size-16" />
      <div className="flex flex-col gap-2">
        <p className={`font-light ${alert ? 'text-info' : 'text-border'}`}>{text}</p>
        {detail && <p className="text-sm font-light text-white/40">{detail}</p>}
      </div>
    </div>
  )
}

type ActiveBox = ReturnType<typeof useJudgeStream>['activeBox']

// 브라우저 색 검출 주기(ms)
const LOCAL_DETECT_MS = 150

// 고정 카메라(top)만 보여준다.
const CAM = 'top'

function VideoCard({ box }: { box: ActiveBox }) {
  const camera = useCameraStream(CAM)
  const [natural, setNatural] = useState({ w: 640, h: 480 })
  // bbox 는 판정한 카메라의 JPEG 픽셀 좌표라서 그 카메라에만 그린다.
  // 다운 동안에는 배경 영상이 없으므로 박스도 숨긴다.
  const shownBox = box?.cam === CAM && !camera.down ? box : null
  // 비전 서버가 보낸 박스가 있으면 그걸, 없으면 브라우저가 색으로 찾은 박스를 그린다.
  const [localBoxes, setLocalBoxes] = useState<Detection[]>([])
  const lastDetectAt = useRef(0)
  const liveBoxes = camera.detections.length ? camera.detections : localBoxes
  const hasFrame = camera.frameUrl !== null

  return (
    <Card className="h-[240px] [container-type:size] lg:h-[330px]">
      {hasFrame && (
        // 카드를 꽉 채우도록(cover) 프레임 비율 그대로 키우고 넘치는 쪽은 잘라낸다.
        // 프레임과 같은 비율의 박스 안에서 그리므로 bbox 는 퍼센트로 그대로 얹힌다.
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            aspectRatio: `${natural.w} / ${natural.h}`,
            // 실제 카드 크기(cq 단위)를 기준으로, 가로와 세로 중 더 크게 필요한 쪽에 맞춘다.
            width: `max(100cqw, calc(100cqh * ${natural.w / natural.h}))`,
          }}
        >
          <img
            src={camera.frameUrl!}
            alt="실시간 영상"
            className="h-full w-full"
            onLoad={(e) => {
              const { naturalWidth: w, naturalHeight: h } = e.currentTarget
              if (w !== natural.w || h !== natural.h) setNatural({ w, h })
              // 프레임마다 돌리면 무거우니 약 150ms 에 한 번만 찾는다. 서버 박스가 오면 건너뛴다.
              const now = performance.now()
              if (!camera.detections.length && now - lastDetectAt.current > LOCAL_DETECT_MS) {
                lastDetectAt.current = now
                setLocalBoxes(detectApples(e.currentTarget))
              }
            }}
          />
          {/* 비전이 프레임마다 보내는 실시간 박스. 판정 박스보다 얇게 그린다. */}
          {!camera.down &&
            liveBoxes.map((d, i) => (
              <div
                key={i}
                className={`absolute border-2 ${d.grade ? gradeBorder[d.grade] : 'border-white/80'}`}
                style={{
                  left: `${(d.bbox[0] / natural.w) * 100}%`,
                  top: `${(d.bbox[1] / natural.h) * 100}%`,
                  width: `${(d.bbox[2] / natural.w) * 100}%`,
                  height: `${(d.bbox[3] / natural.h) * 100}%`,
                }}
              >
                {(d.grade || d.score !== undefined) && (
                  <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-black/60 px-1 text-xs">
                    {d.grade}
                    {d.score !== undefined && ` ${Math.round(d.score * 100)}%`}
                  </span>
                )}
              </div>
            ))}
          {shownBox && (
            <div
              className={`absolute border-2 ${gradeBorder[shownBox.grade]}`}
              style={{
                left: `${(shownBox.bbox[0] / natural.w) * 100}%`,
                top: `${(shownBox.bbox[1] / natural.h) * 100}%`,
                width: `${(shownBox.bbox[2] / natural.w) * 100}%`,
                height: `${(shownBox.bbox[3] / natural.h) * 100}%`,
              }}
            >
              <span className={`absolute -top-6 left-0 text-sm font-semibold ${gradeText[shownBox.grade]}`}>
                {shownBox.grade}
              </span>
            </div>
          )}
        </div>
      )}
      {camera.down ? (
        // 마지막 프레임이 있으면 그 위에 어둡게 덮는다.
        <div className="absolute inset-0 bg-main-3/85">
          <Unavailable text={polite(camera.down.message)} detail={polite(camera.down.reason)} alert />
        </div>
      ) : (
        !hasFrame && (
          <Unavailable text={camera.status === 'open' ? '카메라 연결 대기 중' : '영상을 불러올수 없습니다'} />
        )
      )}

      <div className="relative px-5 pt-6">
        <h3 className="text-xl font-semibold [text-shadow:0_1px_2px_rgba(0,0,0,0.8),0_0_8px_rgba(0,0,0,0.8)]">실시간 영상</h3>
      </div>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-medium text-info">{label}</span>
      <span className="text-2xl font-semibold">{value}</span>
    </div>
  )
}

// 등급 규칙: 빨강 비율 >= 기준 이고 흠·멍 비율 <= 기준 이면 상. 로봇이 이유(reasons)를 보내면 그것을 그대로 쓴다.
function evidenceText(j: LiveJudge) {
  if (j.extra?.reasons?.length) return `${j.extra.reasons.join(', ')} → ${j.grade}`
  if (j.v_value === null || j.threshold === null) return null
  const parts = [`빨강 ${num(j.v_value)} ${j.v_value >= j.threshold ? '≥' : '<'} ${num(j.threshold)}`]
  if (j.extra) {
    parts.push(`흠 ${num(j.extra.dark_ratio)} ${j.extra.dark_ratio <= j.extra.dark_max ? '≤' : '>'} ${num(j.extra.dark_max)}`)
  }
  return `${parts.join(', ')} → ${j.grade}`
}

function Measured({ value, limit }: { value: number; limit: number }) {
  return (
    <>
      {num(value)}
      <span className="text-base font-medium text-info"> / {num(limit)}</span>
    </>
  )
}

function AppleInfoCard({ judge }: { judge: LiveJudge | undefined }) {
  const evidence = judge && evidenceText(judge)

  return (
    <Card title="해당 사과 정보" className="min-h-[280px] lg:h-[330px]">
      {judge ? (
        <div className="flex flex-1 flex-col justify-center gap-4 px-[29px]">
          <Row label="등급" value={<span className={gradeText[judge.grade]}>{judge.grade}</span>} />
          {/* 근거 수치가 없으면(null) 숨긴다. 값 옆의 작은 숫자는 판정 기준이다. */}
          {judge.v_value !== null && judge.threshold !== null && (
            <Row label="빨강 비율" value={<Measured value={judge.v_value} limit={judge.threshold} />} />
          )}
          {/* 멍(회전 검사)을 쟀으면 멍, 아니면 흠을 보인다 — 카드 높이가 정해져 있어 한 줄만 */}
          {judge.extra && (judge.extra.bruise_ratio != null && judge.extra.bruise_max != null ? (
            <Row label="멍 비율" value={<Measured value={judge.extra.bruise_ratio} limit={judge.extra.bruise_max} />} />
          ) : (
            <Row label="흠 비율" value={<Measured value={judge.extra.dark_ratio} limit={judge.extra.dark_max} />} />
          ))}
          {/* 수동 입력 판정(v_value 가 null)은 신뢰도가 0.0 으로 오므로 숨긴다. */}
          {judge.v_value !== null && <Row label="신뢰도" value={pct(judge.confidence)} />}
          {judge.v_value === null && <p className="text-sm text-info">카메라 판정 없이 입력된 등급입니다</p>}
          {evidence && <p className="text-sm text-info">{evidence}</p>}
        </div>
      ) : (
        <p className="flex flex-1 items-center justify-center text-info">판정 대기 중</p>
      )}
    </Card>
  )
}

const phaseLabel: Record<MissionPhase, string> = {
  pick: '집는 중',
  inspect: '검사 중',
  place: '놓는 중',
  home: '복귀 중',
  nudge: '사과 위치 조정 중',
  estop_return: '사과 되돌리는 중',
  estop_rest: '팔 내리는 중',
}

const statusLabel: Record<MissionState['status'], { text: string; className: string }> = {
  idle: { text: '대기 중', className: 'bg-border text-info' },
  running: { text: '진행 중', className: 'bg-grade-high text-black' },
  stalled: { text: '응답 없음', className: 'bg-grade-mid text-black' },
  finished: { text: '완료', className: 'bg-white text-black' },
  estop: { text: '비상정지', className: 'bg-grade-low text-black' },
}

function Stat({ label, value, tone = '' }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-info">{label}</span>
      <span className={`text-2xl font-semibold tabular-nums ${tone}`}>{value}</span>
    </div>
  )
}

// stalled 의 원인은 state 에 없고 stalled 이벤트의 reason 으로 온다.
function stalledReason(events: MissionEvent[]) {
  const reason = events.find((e) => e.event === 'stalled')?.reason
  return typeof reason === 'string' ? polite(reason) : undefined
}

type ControlAction = 'start' | 'stop' | 'park'

function MissionCard({
  mission,
  events,
  robotState,
  pending,
  onControl,
}: {
  mission: MissionState | null
  events: MissionEvent[]
  // 로봇 미션 프로그램 상태. 모르면(꺼져 있음) null
  robotState: RobotState | null
  pending: ControlAction | null
  onControl: (action: ControlAction) => void
}) {
  const running = robotState ? robotState === 'running' : mission?.status === 'running' || mission?.status === 'stalled'
  const halted = robotState === 'estopped' || robotState === 'error'
  // 로봇 프로그램에 닿지 못하면 시작 명령을 보낼 곳이 없다.
  const offline = robotState === null
  const btn = 'rounded-full px-4 py-0.5 font-semibold disabled:opacity-40'
  // 처음 보는 status 가 와도 깨지지 않게 배지는 생략한다.
  // 로봇 프로그램에 닿지 못하면 서버의 비상정지 기록은 오래된 값일 수 있어 그대로 보여주지 않는다.
  const status = !mission
    ? null
    : robotState === null && mission.status === 'estop'
      ? { text: '연결 끊김', className: 'bg-border text-info' }
      : (statusLabel[mission.status] ?? null)
  const index = mission?.apple_index ?? 0
  const count = mission?.apple_count ?? 0

  return (
    <Card
      title="미션 진행"
      right={
        <div className="ml-auto flex items-center gap-2 text-sm">
          {mission?.sim && <span className="rounded-full border border-border px-3 py-0.5 text-info">시뮬레이션</span>}
          {status && <span className={`rounded-full px-3 py-0.5 font-semibold ${status.className}`}>{status.text}</span>}
          {robotState === 'stopping' ? null : running ? (
            <>
              <button onClick={() => onControl('stop')} disabled={pending !== null} className={`${btn} bg-border hover:bg-divider`}>
                {pending === 'stop' ? '요청 중' : '이번 사과까지만'}
              </button>
              {/* 위급하지 않을 때: 사과를 되돌리고 팔을 내린 뒤 멈춘다 */}
              <button onClick={() => onControl('park')} disabled={pending !== null} className={`${btn} bg-border text-grade-low hover:bg-divider`}>
                {pending === 'park' ? '요청 중' : '정리 후 정지'}
              </button>
            </>
          ) : (
            // 비상정지·오류 정지 중에는 시작할 수 없다. 해제(이어하기)로 다시 움직인다.
            <button
              onClick={() => onControl('start')}
              disabled={pending !== null || halted || offline}
              title={halted ? '비상정지를 해제한 뒤 시작할 수 있습니다' : offline ? '로봇 미션 프로그램에 연결할 수 없습니다' : undefined}
              className={`${btn} bg-white text-black`}
            >
              {pending === 'start' ? '시작 중' : '시작'}
            </button>
          )}
        </div>
      }
      className="min-h-[330px] lg:h-[330px]"
    >
      {!mission ? (
        <p className="flex flex-1 items-center justify-center text-info">미션 정보를 기다리는 중</p>
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-6 px-5 pb-6 pt-4 lg:pt-0">
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <span className="shrink-0 text-2xl font-semibold tabular-nums lg:text-3xl">
                {/* 사과 개수 제한이 없는 미션은 전체 개수(apple_count)가 오지 않는다. */}
                {count ? `사과 ${index} / ${count}` : index ? `사과 ${index}번째` : '사과 —'}
              </span>
              <span className="text-info">
                {mission.status === 'finished'
                  ? `미션 완료${mission.duration_s !== null ? ` (${mission.duration_s.toFixed(1)}초)` : ''}`
                  : mission.status === 'estop'
                    ? offline
                      ? '로봇 상태 모름'
                      : '비상정지'
                    : mission.status === 'stalled'
                      ? `${mission.phase ? `${phaseLabel[mission.phase] ?? mission.phase}에서 ` : ''}멈춤`
                      : mission.phase
                      ? phaseLabel[mission.phase]
                      : '대기 중'}
              </span>
            </div>
            {/* 전체 개수를 모르면 진행률을 낼 수 없으므로 막대를 숨긴다. */}
            {count > 0 && (
              <div className="h-2 overflow-hidden rounded-full bg-border">
                <div className="h-full bg-white transition-[width] duration-500" style={{ width: `${(index / count) * 100}%` }} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4 lg:grid-cols-5">
            <Stat label="파지 성공" value={mission.picks_ok} />
            <Stat label="파지 실패" value={mission.picks_failed} tone={mission.picks_failed ? 'text-grade-low' : ''} />
            <Stat label="건너뜀" value={mission.skipped} tone={mission.skipped ? 'text-grade-mid' : ''} />
            {/* 자동 조정: 사과를 떨어뜨리면 하강 속도와 놓는 높이를 낮춘다. */}
            <Stat label="하강 속도" value={mission.adaptive ? `×${mission.adaptive.scale.toFixed(2)}` : '—'} />
            <Stat label="놓는 높이" value={mission.adaptive ? `${(mission.adaptive.release_h * 100).toFixed(1)}cm` : '—'} />
          </div>

          {robotState === 'stopping' && (
            <p className="text-sm font-semibold text-grade-low">
              정리 중… ({mission.phase === 'estop_rest' ? '팔 내리는 중' : '사과 되돌리는 중'}) — 급하면 비상정지를 누르세요
            </p>
          )}
          {halted && <p className="text-sm font-semibold text-grade-low">비상정지 중 — 해제한 뒤 시작할 수 있습니다</p>}
          {offline && (
            <p className="text-sm font-semibold text-grade-mid">로봇 미션 프로그램에 연결할 수 없어 웹에서 제어할 수 없습니다</p>
          )}
          {mission.status === 'stalled' && (
            <p className="text-sm font-semibold text-grade-mid">
              로봇 응답 없음{stalledReason(events) ? ` — ${stalledReason(events)}` : ''}
            </p>
          )}
          {mission.adaptive?.frozen && (
            <p className="text-sm font-semibold text-grade-mid">자동 조정 중단 — 점검이 필요합니다</p>
          )}
        </div>
      )}
    </Card>
  )
}

const f = (e: MissionEvent, key: string) => e[key] as number | string | boolean | null | undefined

// 이벤트를 화면 문구로. 모르는 이벤트는 null 을 돌려 목록에서 뺀다(상태는 state 로 반영된다).
function describeEvent(e: MissionEvent): { text: string; tone?: string } | null {
  switch (e.event) {
    case 'start': {
      const count = f(e, 'apple_count')
      return { text: count ? `미션 시작 (사과 ${count}개)` : '미션 시작' }
    }
    case 'apple': {
      const total = f(e, 'total')
      return { text: total ? `사과 ${f(e, 'index')} / ${total} 시작` : `사과 ${f(e, 'index')}번째 시작` }
    }
    case 'phase': {
      const label = phaseLabel[f(e, 'phase') as MissionPhase]
      return label ? { text: label } : null
    }
    case 'pick': {
      const attempt = Number(f(e, 'attempt') ?? 0) + 1
      return f(e, 'ok')
        ? { text: `파지 성공 (폭 ${f(e, 'width_mm')}mm)` }
        : { text: `파지 실패 (${attempt}번째 시도)`, tone: 'text-grade-low' }
    }
    case 'skip': {
      const reason = f(e, 'reason')
      return { text: `사과 ${f(e, 'index')} 건너뜀${reason ? ` (${polite(String(reason))})` : ''}`, tone: 'text-grade-mid' }
    }
    case 'adaptive': {
      const scale = Number(f(e, 'scale'))
      const releaseH = Number(f(e, 'release_h'))
      return {
        text: `자동 조정: 하강 속도 ×${scale.toFixed(2)}, 놓는 높이 ${(releaseH * 100).toFixed(1)}cm${f(e, 'frozen') ? ' (중단)' : ''}`,
        tone: scale < 1 || f(e, 'frozen') ? 'text-grade-mid' : '',
      }
    }
    case 'end': {
      const d = f(e, 'duration_s')
      return { text: `미션 완료${typeof d === 'number' ? ` (${d.toFixed(1)}초)` : ''}`, tone: 'text-grade-high' }
    }
    case 'stalled': {
      const reason = f(e, 'reason')
      return { text: `로봇 응답 없음${reason ? ` (${polite(String(reason))})` : ''}`, tone: 'text-grade-mid' }
    }
    case 'resume':
      return { text: `비상정지 해제 — 사과 ${f(e, 'index') ?? ''}번째부터 이어서`, tone: 'text-grade-high' }
    case 'estop':
      return { text: `비상정지${f(e, 'reason') ? `: ${polite(String(f(e, 'reason')))}` : ''}`, tone: 'text-grade-low' }
    default:
      return null
  }
}

function MissionEventsCard({ events }: { events: MissionEvent[] }) {
  return (
    <Card title="로봇 이벤트" className="h-[330px]">
      <ul className="flex-1 overflow-y-auto px-5 pb-5 pt-4">
        {events.map((e, i) => {
          const described = describeEvent(e)
          if (!described) return null
          const { text, tone = '' } = described
          return (
            <li key={`${e.ts}-${i}`} className="flex gap-4 border-t border-border py-2 first:border-t-0">
              <span className="shrink-0 tabular-nums text-white/50">{fmtTime(e.ts)}</span>
              <span className={tone}>{text}</span>
            </li>
          )
        })}
        {events.length === 0 && <li className="py-8 text-center text-info">아직 이벤트가 없습니다</li>}
      </ul>
    </Card>
  )
}

// 게이지 호의 중심과 반지름 (public/gauge.svg 의 좌표, 167.274 x 92)
const GAUGE = { w: 167.274, h: 92, cx: 83.637, cy: 88, inner: 60 }

function ConfidenceCard({ average }: { average: number | null }) {
  // 신뢰도는 임계값에서 떨어진 정도라 0.5~1.0 이다. 50% 를 왼쪽 끝(-90°), 100% 를 오른쪽 끝(90°)으로 둔다.
  const ratio = Math.min(Math.max(((average ?? 0.5) - 0.5) / 0.5, 0), 1)
  const angle = -90 + ratio * 180

  return (
    <Card title="신뢰도" className="h-[330px]">
      <div className="flex flex-1 flex-col items-center justify-center gap-5">
        <div className="relative" style={{ width: GAUGE.w, height: GAUGE.h }}>
          <img src="/gauge.svg" alt="" className="size-full" />
          {average !== null && (
            <span
              className="absolute h-6 w-2 rounded-full bg-white transition-transform duration-500"
              style={{
                left: GAUGE.cx - 4,
                top: GAUGE.cy - GAUGE.inner - 24,
                transformOrigin: `50% ${GAUGE.inner + 24}px`,
                transform: `rotate(${angle}deg)`,
              }}
            />
          )}
        </div>
        <div className="flex flex-col items-center gap-2 font-semibold">
          <span className="text-xl">평균 신뢰도</span>
          <span className="text-[40px] leading-none">{average !== null ? pct(average) : '—'}</span>
        </div>
      </div>
    </Card>
  )
}

function GradeCountCard({ stats }: { stats: Stats }) {
  const grades: Grade[] = ['상', '중', '하']

  return (
    <Card title="등급별 사과 개수" right={<span className="text-[15px] text-info">단위: 개</span>} className="h-[280px]">
      <div className="flex flex-1 items-center justify-center gap-6 pt-5 lg:gap-12">
        {grades.map((g) => (
          <div key={g} className="flex w-20 flex-col items-center gap-6 lg:w-30 lg:gap-8">
            <span className="text-2xl font-semibold text-info lg:text-[32px]">{g}</span>
            <span className={`text-5xl font-bold tabular-nums ${gradeText[g]}`}>{stats[g]}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

// 현재 회차에서 떨어뜨린 사과 수. 화면의 recent 는 최근 50개뿐이라 회차 전체 이력에서 센다.
// refreshKey 가 바뀔 때(판정, 놓기 결과, 새 회차) 다시 센다.
function DropCountCard({ refreshKey }: { refreshKey: string }) {
  const [counts, setCounts] = useState<{ dropped: number; placed: number } | null>(null)

  useEffect(() => {
    let alive = true
    api
      .history()
      .then((rows) => {
        if (!alive) return
        // roll_detected 가 null 이면 아직 놓기 결과가 오지 않은 판정이다.
        const placed = rows.filter((r) => r.roll_detected !== null)
        setCounts({ dropped: placed.filter((r) => r.roll_detected).length, placed: placed.length })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [refreshKey])

  return (
    <Card title="떨어뜨린 사과" right={<span className="text-[15px] text-info">단위: 개</span>} className="h-[280px]">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 pt-5">
        <span className={`text-5xl font-bold tabular-nums ${counts?.dropped ? 'text-grade-low' : ''}`}>
          {counts?.dropped ?? '—'}
        </span>
        <span className="text-info">
          {counts && counts.placed > 0
            ? `놓은 사과 ${counts.placed}개 중 ${((counts.dropped / counts.placed) * 100).toFixed(1)}%`
            : '아직 놓은 사과가 없습니다'}
        </span>
      </div>
    </Card>
  )
}

function SummaryCard({ total, cycleTime }: { total: number; cycleTime: number | null }) {
  return (
    <Card title="처리 현황" className="h-[280px]">
      <div className="flex flex-1 flex-col justify-center gap-5 px-[29px]">
        <Row label="전체" value={`${total}개`} />
        <Row label="사이클 타임" value={cycleTime !== null ? `${cycleTime.toFixed(1)}초` : '—'} />
      </div>
    </Card>
  )
}

function RollBadge({ value }: { value: boolean | null }) {
  if (value === null) return <span className="text-white/40">대기</span>
  return value ? <span className="text-grade-low">떨어뜨림</span> : <span className="text-info">정상</span>
}

function HistoryCard({ recent }: { recent: LiveJudge[] }) {
  return (
    <Card title="판정 이력">
      <div className="max-h-96 overflow-auto px-5 pb-5 pt-4">
        <table className="w-full min-w-[560px] whitespace-nowrap lg:whitespace-normal">
          <thead className="text-left text-info">
            <tr>
              <th className="py-2 font-medium">#</th>
              <th className="font-medium">시각</th>
              <th className="font-medium">등급</th>
              <th className="font-medium">신뢰도</th>
              <th className="font-medium">빨강 / 기준</th>
              <th className="font-medium">흠 / 기준</th>
              <th className="font-medium">떨어뜨림</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {recent.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="py-2 text-white/50">{r.id}</td>
                <td>{fmtTime(r.ts)}</td>
                <td className={`font-semibold ${gradeText[r.grade]}`}>{r.grade}</td>
                <td>{r.v_value !== null ? pct(r.confidence) : '—'}</td>
                <td>{r.v_value !== null && r.threshold !== null ? `${num(r.v_value)} / ${num(r.threshold)}` : '—'}</td>
                <td>{r.extra ? `${num(r.extra.dark_ratio)} / ${num(r.extra.dark_max)}` : '—'}</td>
                <td><RollBadge value={r.roll_detected} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {recent.length === 0 && <p className="py-8 text-center text-info">아직 판정이 없습니다</p>}
      </div>
    </Card>
  )
}

async function downloadCsv() {
  const rows = await loadJudges()
  const header = ['번호', '시각', '등급', '신뢰도', '빨강 비율', '빨강 기준', '흠 비율', '흠 기준', '떨어뜨림', '카메라']
  const yesNo = (v: boolean | null) => (v === null ? '' : v ? '예' : '아니오')
  const lines = rows.map((r) =>
    [r.id, formatTs(r.ts), r.grade, r.confidence, r.v_value ?? '', r.threshold ?? '', r.extra?.dark_ratio ?? '', r.extra?.dark_max ?? '', yesNo(r.roll_detected), r.cam ?? ''].join(','),
  )
  saveCsv([header.join(','), ...lines].join('\n'), `ssorry-browser-${formatTs(Date.now() / 1000).slice(0, 10)}.csv`)
}

// 서버 CSV 를 받아 시간 등을 읽기 좋게 바꿔 저장한다. 실패하면 알린다.
const downloadRunCsv = (run?: number) =>
  downloadServerCsv(exportCsvUrl(run)).catch((e: Error) => toast('error', 'CSV 를 내려받지 못했습니다', e.message))

const dateTimeFmt = new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })

// 서버(SQLite)에 남아 있는 회차 목록. 새 회차를 시작해도 이전 회차는 지워지지 않는다.
function RunsCard({ refreshKey }: { refreshKey: string }) {
  const [runs, setRuns] = useState<Run[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    api
      .runs()
      .then((r) => (setRuns(r), setError(false)))
      .catch(() => setError(true))
  }, [refreshKey])

  return (
    <Card
      title="회차 기록"
      right={
        <button
          onClick={() => downloadRunCsv()}
          className="ml-auto rounded-full bg-border px-5 py-1.5 text-sm font-semibold hover:bg-divider"
        >
          전체 CSV
        </button>
      }
    >
      <div className="max-h-96 overflow-auto px-5 pb-5 pt-4">
        {error && <p className="py-8 text-center text-info">회차 기록을 불러오지 못했습니다</p>}
        {runs && (
          <table className="w-full min-w-[560px] whitespace-nowrap lg:whitespace-normal">
            <thead className="text-left text-info">
              <tr>
                <th className="py-2 font-medium">회차</th>
                <th className="font-medium">시작</th>
                <th className="font-medium">종료</th>
                <th className="font-medium">상</th>
                <th className="font-medium">중</th>
                <th className="font-medium">하</th>
                <th className="font-medium">전체</th>
                <th />
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="py-2">{r.id}</td>
                  <td>{dateTimeFmt.format(r.started_at * 1000)}</td>
                  <td>{r.ended_at ? dateTimeFmt.format(r.ended_at * 1000) : <span className="text-grade-high">진행 중</span>}</td>
                  <td className="text-grade-high">{r.stats.상}</td>
                  <td className="text-grade-mid">{r.stats.중}</td>
                  <td className="text-grade-low">{r.stats.하}</td>
                  <td>{r.stats.total}</td>
                  <td className="text-right">
                    <button onClick={() => downloadRunCsv(r.id)} className="text-sm text-info underline-offset-4 hover:underline">
                      CSV
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  )
}

function LocalArchiveCard({ version }: { version: number }) {
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    countJudges()
      .then((n) => (setCount(n), setError(false)))
      .catch(() => setError(true))
  }, [version])

  return (
    <Card title="브라우저 백업">
      {/* 화면 폭과 상관없이 같은 모양이 되도록 짧은 두 줄 + 아래 버튼으로 둔다. */}
      <div className="flex flex-col items-start gap-4 px-5 pb-6 pt-4">
        {error ? (
          <div className="flex flex-col gap-1">
            <p>이 브라우저에서는 기록을 저장할 수 없습니다.</p>
            <p className="text-sm text-info">시크릿 창이거나 사이트 저장소가 막혀 있습니다.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <p>이 브라우저에 판정 {count ?? 0}개를 보관하고 있습니다.</p>
            <p className="text-sm text-info">서버에 접속할 수 없을 때를 대비한 보조 기록입니다.</p>
          </div>
        )}
        <button
          onClick={() => downloadCsv()}
          disabled={!count}
          className="rounded-full bg-border px-5 py-1.5 text-sm font-semibold hover:bg-divider disabled:opacity-40"
        >
          CSV 내려받기
        </button>
      </div>
    </Card>
  )
}

// 누적 기록을 바탕으로 서버가 AI 조언을 만들어 준다. 한 회차 안의 대화를 채팅처럼 쌓아 보여준다.
// 회차가 바뀌면 부모가 key 를 바꿔 대화 전체를 비운다.
type ChatMessage =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'ai'; advice: Advice }
  | { id: number; role: 'error'; text: string }
// 메시지 종류별로 id 를 뺀 모양(Omit 은 유니온을 하나로 합쳐 버려서 나눠서 뺀다)
type NewChatMessage = ChatMessage extends infer M ? (M extends ChatMessage ? Omit<M, 'id'> : never) : never

const fmtAdviceTime = (t: Advice['generated_at']) => fmtTime(typeof t === 'number' ? t : Date.parse(t) / 1000)

function AdviceCard() {
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const nextId = useRef(1)
  const listRef = useRef<HTMLDivElement>(null)

  // 새 메시지나 로딩 표시가 생기면 맨 아래로 내린다.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const push = (m: NewChatMessage) =>
    setMessages((prev) => [...prev, { ...m, id: nextId.current++ } as ChatMessage])

  const onAsk = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    const q = question.trim()
    push({ role: 'user', text: q || '전체 요약을 부탁합니다' })
    setQuestion('')
    setLoading(true)
    try {
      push({ role: 'ai', advice: await api.advice(q || undefined) })
    } catch (err) {
      // 503 이면 서버 detail 문구가 그대로 온다.
      push({ role: 'error', text: polite((err as Error).message) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card title="AI 조언" className="h-[420px]">
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pt-4">
        {messages.length === 0 && !loading && (
          <p className="m-auto text-center text-sm text-info">
            궁금한 점을 물어보세요.
            <br />
            비워 두고 보내면 지금까지의 기록을 요약해 줍니다.
          </p>
        )}
        {messages.map((m) =>
          m.role === 'user' ? (
            <p key={m.id} className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl rounded-br-sm bg-border px-4 py-2 text-sm">
              {m.text}
            </p>
          ) : m.role === 'ai' ? (
            <div key={m.id} className="flex max-w-[90%] flex-col gap-1 self-start">
              <p className="whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-main-1 px-4 py-2 leading-relaxed">{m.advice.advice}</p>
              <span className="px-1 text-xs text-white/40">
                {m.advice.model} · {fmtAdviceTime(m.advice.generated_at)}
                {m.advice.cached && ' · 저장된 답변'}
              </span>
            </div>
          ) : (
            <p key={m.id} className="max-w-[90%] self-start rounded-2xl rounded-bl-sm bg-main-1 px-4 py-2 text-sm text-grade-low">
              {m.text}
            </p>
          ),
        )}
        {loading && (
          <div className="flex items-center gap-2 self-start rounded-2xl rounded-bl-sm bg-main-1 px-4 py-2 text-sm text-info">
            <span className="size-4 animate-spin rounded-full border-2 border-info border-t-transparent" />
            조언을 만드는 중입니다
          </div>
        )}
      </div>

      <form onSubmit={onAsk} className="flex gap-2 border-t border-border px-5 py-4">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="궁금한 점 (비워 두면 전체 요약)"
          className="min-w-0 flex-1 rounded-full border border-border bg-main-1 px-4 py-1.5 text-sm outline-none focus:border-info"
        />
        <button
          type="submit"
          disabled={loading}
          className="shrink-0 rounded-full bg-border px-5 py-1.5 text-sm font-semibold hover:bg-divider disabled:opacity-40"
        >
          {loading ? '생성 중…' : '보내기'}
        </button>
      </form>
    </Card>
  )
}

// 페이지를 막 연 뒤에는 웹소켓이 붙는 중이라 상태가 잠깐 흔들린다. 그동안은 알리지 않는다.
const TOAST_GRACE_MS = 3000

// 헤더에 함께 보여줄 현재 문제들. down 은 선별이 멈추는 문제(빨강), warn 은 일부만 안 되는 문제(노랑).
// estop: 카메라/로봇팔 문제와 로봇 비상정지. 모두 비상정지 화면으로 알린다.
type Issue = { key: string; label: string; level: 'down' | 'warn'; detail: string; estop?: boolean }

// 문제가 새로 생기거나 해결될 때 문제별로 한 번씩 알린다.
function useIssueToasts(issues: Issue[] | null) {
  const prev = useRef<Map<string, Issue> | null>(null)
  const startedAt = useRef<number | null>(null)
  const keys = issues?.map((i) => i.key).join(',') ?? null

  useEffect(() => {
    // 첫 응답 전(null)은 비교하지 않는다.
    if (issues === null) return
    startedAt.current ??= Date.now()
    const before = prev.current
    const now = new Map(issues.map((i) => [i.key, i]))
    prev.current = now
    if (before === null || Date.now() - startedAt.current < TOAST_GRACE_MS) return

    for (const issue of now.values()) {
      if (!before.has(issue.key)) toast(issue.level === 'down' ? 'error' : 'warning', issue.label, issue.detail)
    }
    for (const issue of before.values()) {
      if (!now.has(issue.key)) toast('success', `${issue.label} 해결`, '정상으로 돌아왔습니다')
    }
    // 문제 목록(keys)이 바뀔 때만 비교한다. 같은 문제의 문구만 바뀐 건 알리지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys])
}

function useRollToast(motion: ReturnType<typeof useJudgeStream>['motion']) {
  useEffect(() => {
    if (motion?.roll_detected) {
      toast('warning', '사과를 떨어뜨렸습니다', '다음 동작의 접근 속도와 적재 높이를 낮춥니다')
    }
  }, [motion])
}

function useMissionFinishedToast(mission: MissionState | null) {
  const prev = useRef<MissionState['status'] | null>(null)
  const status = mission?.status ?? null

  useEffect(() => {
    const before = prev.current
    prev.current = status
    if (before && before !== 'finished' && status === 'finished') {
      const d = mission?.duration_s
      toast('success', '미션을 완료했습니다', d !== null && d !== undefined ? `소요 시간 ${d.toFixed(1)}초` : undefined)
    }
    // 상태가 바뀔 때만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])
}

// 로봇이 미션을 하는 중에 이상이 이 시간 넘게 이어지면 웹에서 비상정지를 보낸다.
const AUTO_ESTOP_MS = 10_000

// active 동안 abnormal 이 AUTO_ESTOP_MS 넘게 이어지면 한 번만 onTrigger 를 부른다.
// 이상이 사라지거나 로봇이 멈추면(active=false) 다시 감시한다.
function useAutoEstop(abnormal: Issue[], active: boolean, onTrigger: (reason: string) => void) {
  const watching = active && abnormal.length > 0
  const latest = useRef({ abnormal, onTrigger })
  const fired = useRef(false)

  useEffect(() => {
    latest.current = { abnormal, onTrigger }
  })

  useEffect(() => {
    if (!watching) {
      fired.current = false
      return
    }
    if (fired.current) return
    const timer = setTimeout(() => {
      fired.current = true
      latest.current.onTrigger(latest.current.abnormal.map((i) => i.detail).join(' / '))
    }, AUTO_ESTOP_MS)
    return () => clearTimeout(timer)
  }, [watching])
}

// 비상정지 화면. 원인(카메라, 로봇팔, 로봇 비상정지)이 하나라도 있으면 화면 전체를 덮는다.
// 해제 요청이 성공하면 원인이 바뀌기 전까지 다시 띄우지 않는다.
// robotReachable: 로봇 미션 프로그램에 닿는지. 꺼져 있으면 원격으로 해제할 수 없다.
function EstopOverlay({ reasons, robotReachable }: { reasons: { key: string; detail: string }[]; robotReachable: boolean }) {
  const [clearing, setClearing] = useState(false)
  // 해제하는 순간 모터 전원이 잠깐 빠져 팔이 처질 수 있어서 한 번 더 묻는다.
  const [confirming, setConfirming] = useState(false)
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)
  const key = reasons.map((r) => `${r.key}:${r.detail}`).join('|')

  // 비상정지가 풀리면 해제 기록을 지운다. 그래야 같은 이유로 다시 멈췄을 때도 화면이 뜬다.
  if (!reasons.length && dismissedKey !== null) setDismissedKey(null)
  if (!reasons.length || dismissedKey === key) return null

  const onClear = async () => {
    setClearing(true)
    try {
      await api.control.resume()
      toast('success', '비상정지를 해제했습니다', '멈춘 사과부터 이어서 진행합니다')
      setDismissedKey(key)
    } catch (e) {
      toast('error', '비상정지를 해제하지 못했습니다', polite((e as Error).message))
    } finally {
      setClearing(false)
      setConfirming(false)
    }
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="estop-title"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-8 bg-black/85 px-6 text-center backdrop-blur-sm lg:px-10"
    >
      <h2 id="estop-title" className="text-3xl font-semibold text-grade-low lg:text-4xl">
        비상정지
      </h2>
      <div className="flex max-w-2xl flex-col gap-2">
        {reasons.map((r) => (
          <p key={r.key} className="text-lg lg:text-xl">
            {r.detail}
          </p>
        ))}
        <p className="mt-2 text-info">위 이유로 비상정지가 되었습니다. 비상정지를 해제하시겠습니까?</p>
      </div>
      {!robotReachable && (
        <p className="max-w-2xl text-grade-mid">
          로봇 미션 프로그램에 연결할 수 없어 원격으로 해제할 수 없습니다. 로봇 PC에서 팔을 받친 상태로{' '}
          <code className="rounded bg-main-3 px-1.5 py-0.5">python3 mission.py --resume</code> 을 실행한 뒤{' '}
          <code className="rounded bg-main-3 px-1.5 py-0.5">python3 mission.py --serve</code> 로 다시 켜 주세요.
        </p>
      )}
      {confirming ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-lg font-semibold">팔을 받치고 있나요? 해제하면 팔이 잠깐 처질 수 있습니다.</p>
          <div className="flex gap-3">
            <button onClick={() => setConfirming(false)} disabled={clearing} className="rounded-full bg-border px-6 py-3 font-semibold">
              취소
            </button>
            <button
              onClick={onClear}
              disabled={clearing}
              className="rounded-full bg-grade-low px-8 py-3 text-lg font-semibold text-white disabled:opacity-40"
            >
              {clearing ? '해제 중' : '해제하고 이어하기'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          disabled={!robotReachable}
          className="rounded-full bg-grade-low px-8 py-3 text-lg font-semibold text-white disabled:opacity-40"
        >
          비상정지 해제
        </button>
      )}
    </div>
  )
}

export default function Dashboard() {
  const judge = useJudgeStream()
  const cameras = useCameras()
  const arm = useArm()
  const { status: control, error: controlError } = useControlStatus()
  const robotState = control?.state ?? null
  const [resetting, setResetting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [runsKey, setRunsKey] = useState(0)

  const latest = judge.recent[0]
  // 수동 입력 판정(v_value 가 null, 신뢰도 0.0)은 평균에서 뺀다.
  const measured = judge.recent.filter((r) => r.v_value !== null)
  const average = measured.length ? measured.reduce((sum, r) => sum + r.confidence, 0) / measured.length : null

  // 헤더 연결상태. 화면에 쓰는 고정 카메라만 보고, 문제가 여러 개면 모두 함께 보여준다.
  const topCam = cameras?.cameras.find((c) => c.name === CAM)
  // 로봇팔 정보가 아예 없으면 확인할 수 없으므로 끊긴 것으로 본다.
  const armDead = arm ? arm.arms.length === 0 || arm.arms.some((a) => !a.connected || a.responding === false) : false
  const issues: Issue[] | null =
    cameras === undefined
      ? null
      : cameras === null
        ? // 서버가 죽으면 나머지 상태는 알 수 없으므로 이것만 보여준다.
          [{ key: 'server', label: '서버 연결 끊김', level: 'down', detail: '백엔드 서버가 응답하지 않습니다' }]
        : [
            // 로봇팔이 실제로 끊겼거나 응답하지 않을 때만 비상정지로 본다(화면 덮기, 자동 비상정지 대상).
            // 연결돼 있고 응답도 하는데 ok:false 인 경우(예: CAN 인터페이스 상태값만 DOWN)는 움직이는 로봇을
            // 멈추면 안 되므로 경고로만 보여준다.
            ...(arm?.ok === false && armDead
              ? [{ key: 'arm', label: '비상정지', level: 'down' as const, estop: true, detail: `로봇팔: ${polite(arm.message) ?? '로봇팔 상태를 확인하세요'}` }]
              : []),
            ...(arm?.ok === false && !armDead
              ? [{ key: 'arm-check', label: '로봇팔 확인 필요', level: 'warn' as const, detail: `로봇팔은 응답하지만 서버가 이상으로 봅니다: ${polite(arm.message) ?? '상태를 확인하세요'}` }]
              : []),
            // 화면을 덮는 비상정지는 로봇 프로그램이 직접 알려줄 때만 띄운다.
            // 로봇 프로그램에 닿지 못하면 서버의 미션 상태는 오래된 값일 수 있다(로봇 PC 에서 직접 해제한 경우 등).
            ...(robotState === 'estopped'
              ? [{ key: 'estop', label: '비상정지', level: 'down' as const, estop: true, detail: polite(control?.error ?? judge.mission?.estop_reason) ?? '로봇이 비상정지했습니다' }]
              : []),
            ...(control === null
              ? [{
                  key: 'robot-offline',
                  label: '로봇 연결 끊김',
                  level: 'warn' as const,
                  // 꺼져 있는 것만이 아니라 토큰 불일치 같은 다른 이유도 있으므로 서버가 준 이유를 그대로 보여준다.
                  detail: `${polite(controlError) ?? '로봇 미션 프로그램에 연결할 수 없습니다'} (로봇 PC 에서 mission.py --serve 가 켜져 있는지, 토큰이 같은지 확인하세요).${
                    judge.mission?.status === 'estop' ? ` 마지막 기록: 비상정지 — ${polite(judge.mission.estop_reason) ?? '원인 미상'}` : ''
                  }`,
                }]
              : []),
            ...(robotState === 'stopping'
              ? [{ key: 'stopping', label: '정리 중', level: 'warn' as const, detail: '사과를 되돌리고 팔을 내린 뒤 비상정지합니다' }]
              : []),
            ...(robotState === 'error'
              ? [{ key: 'robot-error', label: '오류 정지', level: 'down' as const, estop: true, detail: polite(control?.error) ?? '로봇이 오류로 멈췄습니다' }]
              : []),
            ...(judge.mission?.status === 'stalled'
              ? [{ key: 'stalled', label: '로봇 응답 없음', level: 'warn' as const, detail: stalledReason(judge.missionEvents) ?? '로봇에서 소식이 끊겼습니다' }]
              : []),
            ...(judge.mission?.adaptive?.frozen
              ? [{ key: 'frozen', label: '자동 조정 중단', level: 'warn' as const, detail: '떨어뜨림 자동 조정이 멈췄습니다. 점검이 필요합니다' }]
              : []),
            ...(!topCam?.live
              ? [{ key: 'camera', label: '비상정지', level: 'down' as const, estop: true, detail: `카메라: ${polite(topCam?.error) ?? '고정 카메라에서 영상이 들어오지 않습니다'}` }]
              : []),
            ...(!judge.connected
              ? [{ key: 'judge', label: '판정 연결 끊김', level: 'warn' as const, detail: '판정 서버에 다시 연결하는 중입니다' }]
              : []),
          ]

  // 로봇팔이 죽으면 카메라가 살아 있어도 선별이 멈추므로 빨강이다.
  const connection: Connection =
    issues === null ? 'warn' : issues.some((i) => i.level === 'down') ? 'down' : issues.length ? 'warn' : 'ok'
  const state =
    issues === null
      ? '연결 확인 중'
      : issues.length
        ? [...new Set(issues.map((i) => i.label))].join(' · ')
        : judge.activeBox
          ? '판별 중'
          : '대기 중'
  const detail = issues?.length ? issues.map((i) => `${i.label}: ${i.detail}`).join('\n') : undefined

  useIssueToasts(issues)

  // 응답을 기다리지 않고 언제든 다시 보낼 수 있게 상태로 막지 않는다.
  const sendEstop = async (autoReason?: string) => {
    try {
      await api.control.estop()
      if (autoReason) toast('error', '10초 넘게 이상이 이어져 비상정지했습니다', autoReason)
      else toast('error', '비상정지했습니다')
    } catch (e) {
      toast('error', '비상정지가 로봇에 전달되지 않았습니다', `${polite((e as Error).message)} — 로봇 PC 에서 직접 멈추세요`)
    }
  }

  // 카메라, 로봇팔, 로봇 응답 없음, 자동 조정 중단이 로봇이 움직이는 동안 10초 넘게 이어지면 비상정지
  const robotMoving = robotState ? robotState === 'running' : judge.mission?.status === 'running' || judge.mission?.status === 'stalled'
  const abnormal = issues?.filter((i) => ['camera', 'arm', 'stalled', 'frozen'].includes(i.key)) ?? []
  useAutoEstop(abnormal, robotMoving, (reason) => sendEstop(reason))

  const [pending, setPending] = useState<ControlAction | null>(null)
  const onControl = async (action: ControlAction) => {
    setPending(action)
    try {
      if (action === 'start') {
        await api.control.start()
        toast('success', '미션을 시작했습니다')
      } else if (action === 'stop') {
        await api.control.stop()
        toast('info', '이번 사과까지만 하고 멈춥니다')
      } else {
        // park 는 정리가 끝난 뒤에(수 초) 응답하므로 누르는 즉시 먼저 알린다.
        toast('info', '정리 후 정지를 시작합니다', '사과를 되돌리고 팔을 내린 뒤 멈춥니다. 급하면 비상정지를 누르세요')
        await api.control.park()
        toast('success', '정리 후 정지했습니다', '해제하면 이어서 진행합니다')
      }
    } catch (e) {
      const failed = { start: '미션을 시작하지 못했습니다', stop: '정지하지 못했습니다', park: '정리 후 정지를 하지 못했습니다' }[action]
      toast('error', failed, polite((e as Error).message))
    } finally {
      setPending(null)
    }
  }
  useRollToast(judge.motion)
  useMissionFinishedToast(judge.mission)

  const onReset = async () => {
    setResetting(true)
    setResetError(null)
    try {
      // 서버가 이전 회차를 SQLite 에 남기므로 브라우저 백업은 보조용이다. 실패해도 진행한다.
      await api
        .history()
        .then(saveJudges)
        .catch((e) => console.error('[localdb] 백업 실패', e))
      await api.resetStats()
      // 성공하면 서버가 모든 /ws/judge 에 새 snapshot 을 보내므로 화면은 그걸로 바뀐다.
      setRunsKey((k) => k + 1)
      toast('success', '새 회차를 시작했습니다', '이전 회차 기록은 분석 > 회차 기록에서 볼 수 있습니다')
    } catch (e) {
      setResetError(`새 회차를 시작하지 못했습니다: ${(e as Error).message}`)
      toast('error', '새 회차를 시작하지 못했습니다', (e as Error).message)
    } finally {
      setResetting(false)
      setConfirming(false)
    }
  }

  return (
    <>
      <DashboardHeader connection={connection} state={state} detail={detail} onEstop={() => sendEstop()} emphasizeEstop={robotState === 'stopping'} robotOffline={control === null} />
      <Toaster />
      <EstopOverlay reasons={issues?.filter((i) => i.estop) ?? []} robotReachable={control !== null} />
      <div className="flex flex-col gap-8 p-4 lg:gap-10 lg:p-20">
        <Section id="realtime" title="실시간">
          <div className="flex flex-col gap-4 lg:gap-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[628fr_302fr_302fr] lg:gap-6">
            <VideoCard box={judge.activeBox} />
            <AppleInfoCard judge={latest} />
            <ConfidenceCard average={average} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
            <MissionCard mission={judge.mission} events={judge.missionEvents} robotState={robotState} pending={pending} onControl={onControl} />
            <MissionEventsCard events={judge.missionEvents} />
          </div>
          </div>
        </Section>

        <Section
          id="stats"
          title="통계"
          right={
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {resetError && <span className="text-grade-low">{resetError}</span>}
              {confirming ? (
                <>
                  <span className="hidden text-info lg:inline">현재 회차를 마감합니다. 기록은 서버에 남습니다</span>
                  <button
                    onClick={() => setConfirming(false)}
                    disabled={resetting}
                    className="rounded-full px-4 py-1.5 text-info hover:bg-border"
                  >
                    취소
                  </button>
                  <button
                    onClick={onReset}
                    disabled={resetting}
                    className="rounded-full bg-white px-5 py-1.5 font-semibold text-black disabled:opacity-40"
                  >
                    {resetting ? '처리 중' : '시작'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirming(true)}
                  className="rounded-full bg-border px-5 py-1.5 font-semibold hover:bg-divider"
                >
                  새 회차 시작
                </button>
              )}
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[519fr_302fr_435fr] lg:gap-6">
            <GradeCountCard stats={judge.stats} />
            <SummaryCard total={judge.stats.total} cycleTime={judge.cycleTime} />
            <DropCountCard refreshKey={`${judge.stats.total}-${judge.motion?.ts ?? ''}-${judge.savedVersion}`} />
          </div>
        </Section>

        <Section id="analysis" title="분석">
          <div className="flex flex-col gap-4 lg:gap-6">
            <HistoryCard recent={judge.recent} />
            {/* 판정 수가 바뀔 때마다 회차별 집계를 다시 받는다. */}
            <RunsCard refreshKey={`${runsKey}-${judge.stats.total}`} />
            <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
              <LocalArchiveCard version={judge.savedVersion} />
              {/* 회차가 바뀌면(새 회차 시작) 이전 회차에 대한 답변을 비운다. */}
              <AdviceCard key={judge.runId ?? 'none'} />
            </div>
          </div>
        </Section>
      </div>
    </>
  )
}
