import { useEffect, useState } from 'react'
import { useCameraStream, type StreamStatus } from '../hooks/useCameraStream'
import { useJudgeStream, type LiveJudge } from '../hooks/useJudgeStream'
import { api, type Cameras, type Grade } from '../lib/api'

const POLL_MS = 2000

const statusLabel: Record<StreamStatus, string> = {
  connecting: '연결 중',
  open: '연결됨',
  closed: '끊김 · 재연결 중',
  missing: '없는 카메라',
}

const camLabel: Record<string, string> = { top: '고정 카메라', wrist: '손목 카메라' }

const gradeColor: Record<Grade, string> = {
  상: 'text-emerald-400 border-emerald-400',
  중: 'text-amber-400 border-amber-400',
}

const timeFmt = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const fmtTime = (ts: number) => timeFmt.format(ts * 1000)
const pct = (n: number) => `${Math.round(n * 100)}%`

function Dot({ ok }: { ok: boolean }) {
  return <span className={`inline-block size-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
}

function Panel({ title, right, children, className = '' }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col gap-4 rounded-xl border border-border bg-main-2 p-6 ${className}`}>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

// /cameras 응답으로 서버 연결 상태와 카메라별 프레임 수신 여부를 같이 본다.
function useCameras() {
  const [cameras, setCameras] = useState<Cameras | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const tick = () =>
      api
        .cameras()
        .then((d) => alive && (setCameras(d), setError(null)))
        .catch((e: Error) => alive && setError(e.message))
    tick()
    const id = setInterval(tick, POLL_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  return { cameras, error }
}

// 판정 근거: V값과 임계값의 비교
function Evidence({ judge }: { judge: LiveJudge }) {
  if (judge.v_value === null || judge.threshold === null) return null
  const passed = judge.v_value >= judge.threshold
  return (
    <p className="font-mono text-sm">
      V값 {judge.v_value} {passed ? '≥' : '<'} 임계값 {judge.threshold}
    </p>
  )
}

function RollBadge({ value }: { value: boolean | null }) {
  if (value === null) return <span className="text-white/40">대기</span>
  return value ? <span className="text-red-400">굴림</span> : <span className="text-info">정상</span>
}

type ActiveBox = ReturnType<typeof useJudgeStream>['activeBox']

function CameraView({ cam, live, box, className = '' }: { cam: string; live?: boolean; box: ActiveBox; className?: string }) {
  const camera = useCameraStream(cam)
  const [natural, setNatural] = useState({ w: 640, h: 480 })
  // bbox 는 판정한 카메라의 JPEG 픽셀 좌표라서 그 카메라에만 그린다.
  const shownBox = box?.cam === cam ? box : null

  return (
    <Panel
      title={camLabel[cam] ?? cam}
      className={className}
      right={
        <div className="flex items-center gap-3 text-sm text-info">
          <Dot ok={camera.status === 'open' && live !== false} />
          {camera.status === 'open' && live === false ? '카메라 연결 대기 중' : statusLabel[camera.status]}
          <span className="tabular-nums">{camera.fps} fps</span>
        </div>
      }
    >
      {/* 컨테이너 비율을 원본 프레임과 같게 맞춰서 bbox 를 퍼센트로 그대로 얹는다. */}
      <div
        className="relative overflow-hidden rounded-lg border border-border bg-black"
        style={{ aspectRatio: `${natural.w} / ${natural.h}` }}
      >
        {camera.frameUrl ? (
          <img
            src={camera.frameUrl}
            alt={`${camLabel[cam] ?? cam} 영상`}
            className="absolute inset-0 h-full w-full"
            onLoad={(e) => {
              const { naturalWidth: w, naturalHeight: h } = e.currentTarget
              if (w !== natural.w || h !== natural.h) setNatural({ w, h })
            }}
          />
        ) : (
          <p className="absolute inset-0 flex items-center justify-center text-info">
            {camera.status === 'open' ? '카메라 연결 대기 중' : '카메라에 연결하는 중입니다'}
          </p>
        )}
        {shownBox && (
          <div
            className={`absolute border-2 ${gradeColor[shownBox.grade]}`}
            style={{
              left: `${(shownBox.bbox[0] / natural.w) * 100}%`,
              top: `${(shownBox.bbox[1] / natural.h) * 100}%`,
              width: `${(shownBox.bbox[2] / natural.w) * 100}%`,
              height: `${(shownBox.bbox[3] / natural.h) * 100}%`,
            }}
          >
            <span className="absolute -top-7 left-0 rounded bg-black/70 px-2 py-0.5 text-sm font-semibold">
              {shownBox.grade}
            </span>
          </div>
        )}
      </div>
    </Panel>
  )
}

export default function Dashboard() {
  const judge = useJudgeStream()
  const { cameras, error: camerasError } = useCameras()
  const [resetting, setResetting] = useState(false)

  const serverOk = !camerasError && cameras !== null
  const mainCam = cameras?.default ?? 'top'
  const sideCams = cameras ? cameras.cameras.map((c) => c.name).filter((n) => n !== mainCam) : ['wrist']
  const isLive = (name: string) => cameras?.cameras.find((c) => c.name === name)?.live
  const latest = judge.recent[0]
  const { stats } = judge
  const ratioHigh = stats.total ? stats.상 / stats.total : 0

  const onReset = async () => {
    setResetting(true)
    // 성공하면 서버가 모든 /ws/judge 에 새 snapshot 을 보내므로 화면은 그걸로 바뀐다.
    await api.resetStats().catch(() => {})
    setResetting(false)
  }

  return (
    <div className="flex flex-col gap-6 px-20 py-10">
      <div className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold">실시간 모니터링</h1>
          <p className="text-info">등급과 함께 판정에 쓰인 수치를 보여줍니다.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-border bg-main-2 px-4 py-2 text-sm">
            <Dot ok={serverOk} />
            {serverOk ? '서버 정상' : '서버 응답 없음'}
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border bg-main-2 px-4 py-2 text-sm">
            <Dot ok={judge.connected} />
            판정 스트림
          </div>
          <button
            onClick={onReset}
            disabled={resetting}
            className="rounded-full border border-border px-4 py-2 text-sm hover:bg-main-3 disabled:opacity-40"
          >
            통계 초기화
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <CameraView cam={mainCam} live={isLive(mainCam)} box={judge.activeBox} className="col-span-2" />

        <div className="flex flex-col gap-6">
          {sideCams.map((name) => (
            <CameraView key={name} cam={name} live={isLive(name)} box={judge.activeBox} />
          ))}

          <Panel title="최근 판정" right={latest && <span className="text-sm text-info">#{latest.id} · {fmtTime(latest.ts)}</span>}>
            {latest ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-baseline gap-4">
                  <span className={`text-6xl font-bold ${gradeColor[latest.grade]}`}>{latest.grade}</span>
                  <span className="text-info">신뢰도 {pct(latest.confidence)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-main-3">
                  <div className="h-full bg-white" style={{ width: pct(latest.confidence) }} />
                </div>
                {latest.v_value !== null && latest.threshold !== null && (
                  <div className="flex flex-col gap-1">
                    <p className="text-sm text-info">판정 근거</p>
                    <Evidence judge={latest} />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-info">아직 판정이 없습니다</p>
            )}
          </Panel>

          <Panel title="로봇 동작">
            {judge.motion ? (
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-info">접근 속도</dt>
                <dd className="text-right tabular-nums">{judge.motion.approach_speed}</dd>
                <dt className="text-info">적재 높이</dt>
                <dd className="text-right tabular-nums">{judge.motion.place_height} m</dd>
                <dt className="text-info">굴림</dt>
                <dd className="text-right"><RollBadge value={judge.motion.roll_detected} /></dd>
              </dl>
            ) : (
              <p className="text-sm text-info">동작 정보가 아직 없습니다</p>
            )}
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <Panel title="누적 통계">
          <div className="grid grid-cols-3 gap-4">
            {([['상', stats.상], ['중', stats.중], ['전체', stats.total]] as const).map(([label, n]) => (
              <div key={label} className="flex flex-col gap-1">
                <span className="text-sm text-info">{label}</span>
                <span className="text-3xl font-semibold tabular-nums">{n}</span>
              </div>
            ))}
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-main-3">
            <div className="bg-emerald-400" style={{ width: pct(ratioHigh) }} />
            <div className="bg-amber-400" style={{ width: stats.total ? pct(1 - ratioHigh) : 0 }} />
          </div>
          <p className="text-sm text-info">
            사이클 타임 {judge.cycleTime !== null ? `${judge.cycleTime.toFixed(1)}초` : '—'}
          </p>
        </Panel>

        <Panel title="판정 이력" className="col-span-2">
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-main-2 text-left text-info">
                <tr>
                  <th className="py-2 font-normal">#</th>
                  <th className="font-normal">시각</th>
                  <th className="font-normal">등급</th>
                  <th className="font-normal">신뢰도</th>
                  <th className="font-normal">근거</th>
                  <th className="font-normal">굴림</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {judge.recent.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-2 text-white/50">{r.id}</td>
                    <td>{fmtTime(r.ts)}</td>
                    <td className={`font-semibold ${gradeColor[r.grade]}`}>{r.grade}</td>
                    <td>{pct(r.confidence)}</td>
                    <td className="font-mono">{r.v_value !== null && r.threshold !== null ? `${r.v_value} / ${r.threshold}` : '—'}</td>
                    <td><RollBadge value={r.roll_detected} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  )
}
