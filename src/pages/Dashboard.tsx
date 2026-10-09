import { useEffect, useState } from 'react'
import DashboardHeader from '../components/DashboardHeader'
import { useCameraStream } from '../hooks/useCameraStream'
import { useJudgeStream, type LiveJudge } from '../hooks/useJudgeStream'
import { api, exportCsvUrl, type Cameras, type Grade, type Run } from '../lib/api'
import { countJudges, loadJudges, saveJudges } from '../lib/localdb'

const POLL_MS = 2000

const gradeText: Record<Grade | '하', string> = {
  상: 'text-grade-high',
  중: 'text-grade-mid',
  하: 'text-grade-low',
}
const gradeBorder: Record<Grade, string> = {
  상: 'border-grade-high',
  중: 'border-grade-mid',
}

const timeFmt = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const fmtTime = (ts: number) => timeFmt.format(ts * 1000)
const pct = (n: number) => `${(n * 100).toFixed(1)}%`

// /cameras 응답으로 카메라 목록과 카메라별 프레임 수신 여부를 본다.
function useCameras() {
  const [cameras, setCameras] = useState<Cameras | null>(null)

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

function Section({ id, title, right, children }: { id: string; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[32px] font-semibold">{title}</h2>
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

const CARD_RATIO = 628 / 330

// 고정 카메라(top)만 보여준다.
const CAM = 'top'

function VideoCard({ box }: { box: ActiveBox }) {
  const camera = useCameraStream(CAM)
  const [natural, setNatural] = useState({ w: 640, h: 480 })
  // bbox 는 판정한 카메라의 JPEG 픽셀 좌표라서 그 카메라에만 그린다.
  // 다운 동안에는 배경 영상이 없으므로 박스도 숨긴다.
  const shownBox = box?.cam === CAM && !camera.down ? box : null
  const ratio = natural.w / natural.h
  const hasFrame = camera.frameUrl !== null

  return (
    <Card className="h-[330px]">
      {hasFrame && (
        // 카드를 꽉 채우도록(cover) 프레임 비율 그대로 키우고 넘치는 쪽은 잘라낸다.
        // 프레임과 같은 비율의 박스 안에서 그리므로 bbox 는 퍼센트로 그대로 얹힌다.
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            aspectRatio: `${natural.w} / ${natural.h}`,
            ...(ratio < CARD_RATIO ? { width: '100%' } : { height: '100%' }),
          }}
        >
          <img
            src={camera.frameUrl!}
            alt="실시간 영상"
            className="h-full w-full"
            onLoad={(e) => {
              const { naturalWidth: w, naturalHeight: h } = e.currentTarget
              if (w !== natural.w || h !== natural.h) setNatural({ w, h })
            }}
          />
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
          <Unavailable text={camera.down.message} detail={camera.down.reason} alert />
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

function AppleInfoCard({ judge }: { judge: LiveJudge | undefined }) {
  return (
    <Card title="해당 사과 정보" className="h-[330px]">
      {judge ? (
        <div className="flex flex-1 flex-col justify-center gap-5 px-[29px]">
          <Row label="등급" value={<span className={gradeText[judge.grade]}>{judge.grade}</span>} />
          {/* 근거 수치의 출처가 확정되지 않아 null 이면 숨긴다. */}
          {judge.v_value !== null && <Row label="명도값" value={judge.v_value} />}
          {judge.threshold !== null && <Row label="적용 임계값" value={judge.threshold} />}
          <Row label="신뢰도" value={pct(judge.confidence)} />
        </div>
      ) : (
        <p className="flex flex-1 items-center justify-center text-info">판정 대기 중</p>
      )}
    </Card>
  )
}

// 게이지 호의 중심과 반지름 (public/gauge.svg 의 좌표, 167.274 x 92)
const GAUGE = { w: 167.274, h: 92, cx: 83.637, cy: 88, inner: 60 }

function ConfidenceCard({ average }: { average: number | null }) {
  // 0% 는 왼쪽 끝(-90°), 100% 는 오른쪽 끝(90°)
  const angle = -90 + (average ?? 0) * 180

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

function GradeCountCard({ stats }: { stats: Record<string, number> }) {
  // 디자인에는 하 등급이 있지만 서버는 아직 상/중만 판정한다.
  const grades = ['상', '중', '하'] as const

  return (
    <Card title="등급별 사과 개수" right={<span className="text-[15px] text-info">단위: 개</span>} className="h-[280px]">
      <div className="flex flex-1 items-center justify-center gap-12 pt-5">
        {grades.map((g) => (
          <div key={g} className="flex w-30 flex-col items-center gap-8">
            <span className="text-[32px] font-semibold text-info">{g}</span>
            <span className={`text-5xl font-bold tabular-nums ${gradeText[g]}`}>{stats[g] ?? 0}</span>
          </div>
        ))}
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
  return value ? <span className="text-grade-low">굴림</span> : <span className="text-info">정상</span>
}

function HistoryCard({ recent }: { recent: LiveJudge[] }) {
  return (
    <Card title="판정 이력">
      <div className="max-h-96 overflow-y-auto px-5 pb-5 pt-4">
        <table className="w-full">
          <thead className="sticky top-0 bg-main-3 text-left text-info">
            <tr>
              <th className="py-2 font-medium">#</th>
              <th className="font-medium">시각</th>
              <th className="font-medium">등급</th>
              <th className="font-medium">신뢰도</th>
              <th className="font-medium">명도값 / 임계값</th>
              <th className="font-medium">굴림</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {recent.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="py-2 text-white/50">{r.id}</td>
                <td>{fmtTime(r.ts)}</td>
                <td className={`font-semibold ${gradeText[r.grade]}`}>{r.grade}</td>
                <td>{pct(r.confidence)}</td>
                <td>{r.v_value !== null && r.threshold !== null ? `${r.v_value} / ${r.threshold}` : '—'}</td>
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
  const header = ['id', 'time', 'grade', 'confidence', 'v_value', 'threshold', 'roll_detected', 'cam']
  const lines = rows.map((r) =>
    [r.id, new Date(r.ts * 1000).toISOString(), r.grade, r.confidence, r.v_value ?? '', r.threshold ?? '', r.roll_detected ?? '', r.cam ?? ''].join(','),
  )
  // 엑셀에서 한글이 깨지지 않게 BOM 을 붙인다.
  const blob = new Blob(['\uFEFF' + [header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ssorry-judges-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

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
        <a
          href={exportCsvUrl()}
          download
          className="ml-auto rounded-full bg-border px-5 py-1.5 text-sm font-semibold hover:bg-divider"
        >
          전체 CSV
        </a>
      }
    >
      <div className="max-h-96 overflow-y-auto px-5 pb-5 pt-4">
        {error && <p className="py-8 text-center text-info">회차 기록을 불러오지 못했습니다</p>}
        {runs && (
          <table className="w-full">
            <thead className="sticky top-0 bg-main-3 text-left text-info">
              <tr>
                <th className="py-2 font-medium">회차</th>
                <th className="font-medium">시작</th>
                <th className="font-medium">종료</th>
                <th className="font-medium">상</th>
                <th className="font-medium">중</th>
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
                  <td>{r.stats.total}</td>
                  <td className="text-right">
                    <a href={exportCsvUrl(r.id)} download className="text-sm text-info underline-offset-4 hover:underline">
                      CSV
                    </a>
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
      <div className="flex items-center justify-between gap-6 px-5 pb-6 pt-4">
        <p className="text-info">
          {error
            ? '이 브라우저에서는 기록을 저장할 수 없습니다 (시크릿 창이거나 저장소가 막혀 있습니다)'
            : `서버에 접속할 수 없을 때를 대비해 이 브라우저에도 판정 ${count ?? 0}개를 보관하고 있습니다.`}
        </p>
        <button
          onClick={() => downloadCsv()}
          disabled={!count}
          className="shrink-0 rounded-full bg-border px-5 py-1.5 text-sm font-semibold hover:bg-divider disabled:opacity-40"
        >
          CSV 내려받기
        </button>
      </div>
    </Card>
  )
}

export default function Dashboard() {
  const judge = useJudgeStream()
  const cameras = useCameras()
  const [resetting, setResetting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [runsKey, setRunsKey] = useState(0)

  const latest = judge.recent[0]
  const average = judge.recent.length
    ? judge.recent.reduce((sum, r) => sum + r.confidence, 0) / judge.recent.length
    : null

  const connected = cameras !== null && judge.connected
  const state = !connected ? '연결 끊김' : judge.activeBox ? '판별 중' : '대기 중'

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
    } catch (e) {
      setResetError(`새 회차를 시작하지 못했습니다: ${(e as Error).message}`)
    } finally {
      setResetting(false)
      setConfirming(false)
    }
  }

  return (
    <>
      <DashboardHeader connected={connected} state={state} />
      <div className="flex flex-col gap-10 p-20">
        <Section id="realtime" title="실시간">
          <div className="grid grid-cols-[628fr_302fr_302fr] gap-6">
            <VideoCard box={judge.activeBox} />
            <AppleInfoCard judge={latest} />
            <ConfidenceCard average={average} />
          </div>
        </Section>

        <Section
          id="stats"
          title="통계"
          right={
            <div className="flex items-center gap-2 text-sm">
              {resetError && <span className="text-grade-low">{resetError}</span>}
              {confirming ? (
                <>
                  <span className="text-info">현재 회차를 마감합니다. 기록은 서버에 남습니다</span>
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
          <div className="grid grid-cols-[519fr_302fr_435fr] gap-6">
            <GradeCountCard stats={judge.stats} />
            <SummaryCard total={judge.stats.total} cycleTime={judge.cycleTime} />
          </div>
        </Section>

        <Section id="analysis" title="분석">
          <div className="flex flex-col gap-6">
            <HistoryCard recent={judge.recent} />
            {/* 판정 수가 바뀔 때마다 회차별 집계를 다시 받는다. */}
            <RunsCard refreshKey={`${runsKey}-${judge.stats.total}`} />
            <LocalArchiveCard version={judge.savedVersion} />
          </div>
        </Section>
      </div>
    </>
  )
}
