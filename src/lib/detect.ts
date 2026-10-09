// 브라우저에서 프레임의 색으로 사과 위치를 대략 찾는다.
// 비전 서버가 detections 를 보내지 않을 때 화면에 박스를 계속 그리기 위한 보조 수단이다.
// 판정과는 별개라 위치만 대략 맞으면 된다.
import type { Detection } from '../hooks/useCameraStream'

// 계산은 줄인 프레임에서 한다. 폭 160px 이면 프레임당 수 ms 다.
const WORK_WIDTH = 160
// 사과로 볼 최소 크기(줄인 프레임 넓이 대비 비율)와 가로세로 비율 범위
const MIN_AREA_RATIO = 0.002
// 사과는 거의 둥글어서 길쭉한 덩어리(손, 팔 조각)는 뺀다.
const MAX_ASPECT = 1.6

let canvas: HTMLCanvasElement | null = null

// RGB(0~255) → 색상(0~360), 채도, 명도(0~1)
function hsv(r: number, g: number, b: number) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max / 255 }
}

// 빨간 사과와 노란 사과. 청록 트레이, 회색 바닥, 갈색 상자(채도가 낮은 주황)는 빠지게 잡았다.
// 기준값은 실제 top 카메라 프레임(1280x720)으로 맞췄다.
function isApple(r: number, g: number, b: number) {
  const { h, s, v } = hsv(r, g, b)
  if (v < 0.2) return false
  // 손(피부색)은 색상이 비슷하지만 채도가 낮아서 채도 기준으로 뺀다.
  const red = (h <= 20 || h >= 340) && s >= 0.55
  const yellow = h >= 38 && h <= 70 && s >= 0.55 && v >= 0.4
  return red || yellow
}

export function detectApples(img: HTMLImageElement): Detection[] {
  const { naturalWidth: nw, naturalHeight: nh } = img
  if (!nw || !nh) return []

  const w = WORK_WIDTH
  const h = Math.max(1, Math.round((nh / nw) * w))
  canvas ??= document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  ctx.drawImage(img, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)

  const mask = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    if (isApple(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])) mask[i] = 1
  }

  // 붙어 있는 영역끼리 묶어 박스를 만든다(4방향 연결).
  const seen = new Uint8Array(w * h)
  const stack: number[] = []
  const boxes: Detection[] = []
  const minArea = MIN_AREA_RATIO * w * h
  const scaleX = nw / w
  const scaleY = nh / h

  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || seen[start]) continue
    let minX = w, minY = h, maxX = 0, maxY = 0, area = 0
    stack.push(start)
    seen[start] = 1
    while (stack.length) {
      const p = stack.pop()!
      const x = p % w
      const y = (p - x) / w
      area++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      const next = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]
      for (const q of next) {
        if (q >= 0 && mask[q] && !seen[q]) {
          seen[q] = 1
          stack.push(q)
        }
      }
    }

    const bw = maxX - minX + 1
    const bh = maxY - minY + 1
    if (area < minArea) continue
    if (bw / bh > MAX_ASPECT || bh / bw > MAX_ASPECT) continue
    boxes.push({ bbox: [minX * scaleX, minY * scaleY, bw * scaleX, bh * scaleY] })
  }

  return boxes
}
