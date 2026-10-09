import { useEffect, useState } from 'react'
import { useCameraStream, type StreamStatus } from '../hooks/useCameraStream'
import { useJudgeStream, type LiveJudge } from '../hooks/useJudgeStream'
import { api, type Grade, type Health } from '../lib/api'

const POLL_MS = 2000

const statusLabel: Record<StreamStatus, string> = {
  connecting: '연결 중',
  open: '연결됨',
  closed: '끊김 · 재연결 중',
}

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

function useHealth() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const tick = () =>
      api
        .health()
        .then((d) => alive && (setHealth(d), setError(null)))
        .catch((e: Error) => alive && setError(e.message))
    tick()
    const id = setInterval(tick, POLL_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  return { health, error }
}

// 판정 근거: V값과 임계값의 비교
function Evidence({ judge }: { judge: LiveJudge }) {
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

export default function Dashboard() {
  const camera = useCameraStream()
  const judge = useJudgeStream()
  const { health, error: healthError } = useHealth()
  const [natural, setNatural] = useState({ w: 640, h: 480 })
  const [resetting, setResetting] = useState(false)

  const serverOk = !healthError && health?.status === 'ok'
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
            {serverOk ? `서버 정상 · ${health?.ros_node}` : '서버 응답 없음'}
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
        <Panel
          title="카메라"
          className="col-span-2"
          right={
            <div className="flex items-center gap-3 text-sm text-info">
              <Dot ok={camera.status === 'open'} />
              {statusLabel[camera.status]}
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
                alt="카메라 영상"
                className="absolute inset-0 h-full w-full"
                onLoad={(e) => {
                  const { naturalWidth: w, naturalHeight: h } = e.currentTarget
                  if (w !== natural.w || h !== natural.h) setNatural({ w, h })
                }}
              />
            ) : (
              <p className="absolute inset-0 flex items-center justify-center text-info">
                {camera.status === 'open' ? '프레임을 기다리는 중입니다' : '카메라에 연결하는 중입니다'}
              </p>
            )}
            {judge.activeBox && (
              <div
                className={`absolute border-2 ${gradeColor[judge.activeBox.grade]}`}
                style={{
                  left: `${(judge.activeBox.bbox[0] / natural.w) * 100}%`,
                  top: `${(judge.activeBox.bbox[1] / natural.h) * 100}%`,
                  width: `${(judge.activeBox.bbox[2] / natural.w) * 100}%`,
                  height: `${(judge.activeBox.bbox[3] / natural.h) * 100}%`,
                }}
              >
                <span className="absolute -top-7 left-0 rounded bg-black/70 px-2 py-0.5 text-sm font-semibold">
                  {judge.activeBox.grade}
                </span>
              </div>
            )}
          </div>
          {camera.topic && <p className="font-mono text-xs text-white/50">{camera.topic}</p>}
        </Panel>

        <div className="flex flex-col gap-6">
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
                <div className="flex flex-col gap-1">
                  <p className="text-sm text-info">판정 근거</p>
                  <Evidence judge={latest} />
                </div>
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
                    <td className="font-mono">{r.v_value} / {r.threshold}</td>
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
