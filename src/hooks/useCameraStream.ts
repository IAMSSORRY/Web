import { useEffect, useState } from 'react'
import { api, wsUrl } from '../lib/api'

export type StreamStatus = 'connecting' | 'open' | 'closed'

export function useCameraStream() {
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<StreamStatus>('connecting')
  const [topic, setTopic] = useState<string | null>(null)
  const [fps, setFps] = useState(0)

  useEffect(() => {
    let ws: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    let disposed = false
    let count = 0
    let current: string | null = null

    const fpsTimer = setInterval(() => {
      setFps(count)
      count = 0
    }, 1000)

    const connect = async (needSession: boolean) => {
      if (needSession) await api.session().catch(() => {})
      if (disposed) return

      ws = new WebSocket(wsUrl('/ws/camera'))
      ws.binaryType = 'blob'
      setStatus('connecting')

      ws.onopen = () => setStatus('open')
      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          const msg = JSON.parse(ev.data)
          if (msg.type === 'hello') setTopic(msg.topic)
          return
        }
        const url = URL.createObjectURL(ev.data)
        if (current) URL.revokeObjectURL(current)
        current = url
        setFrameUrl(url)
        count++
      }
      ws.onclose = (ev) => {
        setStatus('closed')
        // 4401: 세션 없음 → 쿠키부터 다시 받고 붙는다.
        if (!disposed) retry = setTimeout(() => connect(ev.code === 4401), 1000)
      }
    }

    connect(true)

    return () => {
      disposed = true
      clearTimeout(retry)
      clearInterval(fpsTimer)
      ws?.close()
      if (current) URL.revokeObjectURL(current)
    }
  }, [])

  return { frameUrl, status, topic, fps }
}
