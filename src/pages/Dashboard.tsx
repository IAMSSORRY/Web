import { useEffect, useState } from 'react'
import { useCameraStream, type StreamStatus } from '../hooks/useCameraStream'
import { api, type Health, type Topics } from '../lib/api'

const POLL_MS = 2000

const statusLabel: Record<StreamStatus, string> = {
  connecting: '연결 중',
  open: '연결됨',
  closed: '끊김 · 재연결 중',
}

function Dot({ ok }: { ok: boolean }) {
  return <span className={`inline-block size-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
}

function Panel({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-main-2 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

function usePolling<T>(fn: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const tick = () =>
      fn()
        .then((d) => alive && (setData(d), setError(null)))
        .catch((e: Error) => alive && setError(e.message))
    tick()
    const id = setInterval(tick, POLL_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [fn])

  return { data, error }
}

export default function Dashboard() {
  const camera = useCameraStream()
  const health = usePolling<Health>(api.health)
  const topics = usePolling<Topics>(api.topics)
  const last = usePolling(api.last)

  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const serverOk = !health.error && health.data?.status === 'ok'

  const onPublish = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    setSending(true)
    setSendError(null)
    try {
      await api.publish(text)
      setText('')
    } catch (err) {
      setSendError((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 px-20 py-10">
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold">실시간 모니터링</h1>
          <p className="text-info">ROS2 브리지 서버와 연결된 상태입니다.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-main-2 px-4 py-2 text-sm">
          <Dot ok={serverOk} />
          {serverOk ? `서버 정상 · ${health.data?.ros_node}` : `서버 응답 없음${health.error ? ` (${health.error})` : ''}`}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <Panel
            title="카메라"
            right={
              <div className="flex items-center gap-3 text-sm text-info">
                <Dot ok={camera.status === 'open'} />
                {statusLabel[camera.status]}
                <span className="tabular-nums">{camera.fps} fps</span>
              </div>
            }
          >
            <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-border bg-black">
              {camera.frameUrl ? (
                <img src={camera.frameUrl} alt="카메라 영상" className="h-full w-full object-contain" />
              ) : (
                <p className="text-info">
                  {camera.status === 'open' ? '프레임을 기다리는 중입니다' : '카메라에 연결하는 중입니다'}
                </p>
              )}
            </div>
            {camera.topic && <p className="font-mono text-xs text-white/50">{camera.topic}</p>}
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel title="메시지 (/chatter)">
            <form onSubmit={onPublish} className="flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="보낼 메시지"
                className="min-w-0 flex-1 rounded-lg border border-border bg-main-3 px-3 py-2 outline-none focus:border-info"
              />
              <button
                type="submit"
                disabled={sending || !text.trim()}
                className="rounded-lg bg-white px-4 py-2 font-semibold text-black disabled:opacity-40"
              >
                발행
              </button>
            </form>
            {sendError && <p className="text-sm text-red-400">{sendError}</p>}
            <div className="flex flex-col gap-1">
              <p className="text-sm text-info">마지막 수신</p>
              <p className="break-all font-mono">{last.data?.last_message ?? '—'}</p>
            </div>
          </Panel>

          <Panel title="토픽">
            {topics.data ? (
              <ul className="flex flex-col gap-2">
                {Object.entries(topics.data).map(([name, types]) => (
                  <li key={name} className="flex flex-col">
                    <span className="font-mono text-sm">{name}</span>
                    <span className="font-mono text-xs text-white/50">{types.join(', ')}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-info">{topics.error ?? '불러오는 중'}</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
