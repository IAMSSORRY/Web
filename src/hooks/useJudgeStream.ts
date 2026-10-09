import { useEffect, useState } from 'react'
import { api, wsUrl, type JudgeMessage, type JudgeRecord, type Stats } from '../lib/api'

export type Bbox = [number, number, number, number]
export type Motion = Extract<JudgeMessage, { type: 'motion' }>
export type LiveJudge = JudgeRecord & { bbox?: Bbox; cam?: string }

const MAX_RECENT = 50
// 판정 순간의 위치라서 사과가 움직이면 어긋난다. 잠깐만 보여준다.
const BOX_VISIBLE_MS = 2500

export function useJudgeStream() {
  const [connected, setConnected] = useState(false)
  const [stats, setStats] = useState<Stats>({ 상: 0, 중: 0, total: 0 })
  const [cycleTime, setCycleTime] = useState<number | null>(null)
  // 최신 판정이 앞에 온다.
  const [recent, setRecent] = useState<LiveJudge[]>([])
  const [motion, setMotion] = useState<Motion | null>(null)
  const [activeBox, setActiveBox] = useState<{ bbox: Bbox; grade: JudgeRecord['grade']; cam: string } | null>(null)

  useEffect(() => {
    let ws: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    let disposed = false
    let boxTimer: ReturnType<typeof setTimeout> | undefined

    const onMessage = (msg: JudgeMessage) => {
      switch (msg.type) {
        case 'snapshot':
          setStats(msg.stats)
          setCycleTime(msg.cycle_time)
          setRecent([...msg.recent].reverse())
          setMotion(null)
          break
        case 'judge': {
          const { id, grade, confidence, v_value, threshold, ts, bbox, cam } = msg
          const judge: LiveJudge = { id, grade, confidence, v_value, threshold, ts, bbox, cam, roll_detected: null }
          setRecent((prev) => [judge, ...prev].slice(0, MAX_RECENT))
          setActiveBox({ bbox, grade, cam })
          clearTimeout(boxTimer)
          boxTimer = setTimeout(() => setActiveBox(null), BOX_VISIBLE_MS)
          break
        }
        case 'stats':
          setStats(msg.stats)
          setCycleTime(msg.cycle_time)
          break
        case 'motion':
          setMotion(msg)
          // 모션은 보통 가장 최근 판정의 결과다.
          setRecent((prev) =>
            prev.length ? [{ ...prev[0], roll_detected: msg.roll_detected }, ...prev.slice(1)] : prev,
          )
          break
      }
    }

    const connect = async (needSession: boolean) => {
      if (needSession) await api.session().catch(() => {})
      if (disposed) return

      ws = new WebSocket(wsUrl('/ws/judge'))
      ws.onopen = () => setConnected(true)
      ws.onmessage = (ev) => onMessage(JSON.parse(ev.data))
      ws.onclose = (ev) => {
        setConnected(false)
        if (disposed) return
        // 4401: 세션 없음 → 쿠키부터 다시 받는다. 4408(큐 넘침)과 나머지는 그냥 재연결.
        retry = setTimeout(() => connect(ev.code === 4401), ev.code === 4408 ? 0 : 1000)
      }
    }

    connect(true)

    return () => {
      disposed = true
      clearTimeout(retry)
      clearTimeout(boxTimer)
      ws?.close()
    }
  }, [])

  return { connected, stats, cycleTime, recent, motion, activeBox }
}
