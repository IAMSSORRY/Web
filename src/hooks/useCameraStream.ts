import { useEffect, useState } from 'react'
import { api, wsUrl } from '../lib/api'

export type StreamStatus = 'connecting' | 'open' | 'closed' | 'missing'

// 카메라 하나당 웹소켓 하나. 두 대를 보려면 이 훅을 두 번 쓴다.
export function useCameraStream(cam: string) {
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<StreamStatus>('connecting')
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

      ws = new WebSocket(wsUrl(`/ws/camera?cam=${encodeURIComponent(cam)}`))
      ws.binaryType = 'blob'
      setStatus('connecting')

      ws.onopen = () => setStatus('open')
      ws.onmessage = (ev) => {
        // 첫 텍스트 메시지는 hello 다. 화면에 필요한 건 없다.
        if (typeof ev.data === 'string') return
        const url = URL.createObjectURL(ev.data)
        if (current) URL.revokeObjectURL(current)
        current = url
        setFrameUrl(url)
        count++
      }
      ws.onclose = (ev) => {
        if (disposed) return
        // 4404: 서버에 없는 카메라. 설정이 바뀔 수 있으니 천천히 다시 본다.
        if (ev.code === 4404) {
          setStatus('missing')
          retry = setTimeout(() => connect(false), 5000)
          return
        }
        setStatus('closed')
        // 4401: 세션 없음 → 쿠키부터 다시 받고 붙는다.
        retry = setTimeout(() => connect(ev.code === 4401), 1000)
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
  }, [cam])

  return { frameUrl, status, fps }
}
