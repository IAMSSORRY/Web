import { useEffect, useState } from 'react'
import { api, wsUrl, type Grade } from '../lib/api'

export type StreamStatus = 'connecting' | 'open' | 'closed' | 'missing'

// 서버가 보내는 camera_status(live:false). 웹소켓은 유지된 채 카메라만 죽은 상태다.
export type CameraDown = { message: string; reason?: string }

// 비전이 프레임마다 보내는 검출 결과. bbox 는 이 카메라 JPEG 의 원본 픽셀 [x, y, w, h].
export type Detection = { bbox: [number, number, number, number]; grade?: Grade; score?: number }

// 이 시간 동안 새 검출이 없으면 박스를 지운다(오래된 박스가 화면에 남지 않게).
const DETECTION_STALE_MS = 1000

// 카메라 하나당 웹소켓 하나. 두 대를 보려면 이 훅을 두 번 쓴다.
export function useCameraStream(cam: string) {
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<StreamStatus>('connecting')
  const [fps, setFps] = useState(0)
  const [down, setDown] = useState<CameraDown | null>(null)
  const [detections, setDetections] = useState<Detection[]>([])

  useEffect(() => {
    let ws: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    let disposed = false
    let count = 0
    let current: string | null = null
    let staleTimer: ReturnType<typeof setTimeout> | undefined

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

      ws.onopen = () => {
        setStatus('open')
        // 다운 상태라면 hello 다음에 바로 live:false 가 다시 온다.
        setDown(null)
      }
      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          const msg = JSON.parse(ev.data)
          // live:true 바로 뒤로 프레임이 다시 오므로 표시만 걷으면 된다.
          if (msg.type === 'camera_status') {
            setDown(msg.live ? null : { message: msg.message ?? '카메라를 불러오지 못했습니다', reason: msg.reason })
            if (!msg.live) setDetections([])
          } else if (msg.type === 'detections' && (msg.cam === undefined || msg.cam === cam)) {
            setDetections(Array.isArray(msg.boxes) ? msg.boxes : [])
            clearTimeout(staleTimer)
            staleTimer = setTimeout(() => setDetections([]), DETECTION_STALE_MS)
          }
          // 처음 보는 type 은 무시한다.
          return
        }
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
      clearTimeout(staleTimer)
      clearInterval(fpsTimer)
      ws?.close()
      if (current) URL.revokeObjectURL(current)
    }
  }, [cam])

  return { frameUrl, status, fps, down, detections }
}
