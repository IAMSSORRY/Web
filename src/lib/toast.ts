// 컴포넌트 밖(이벤트 핸들러, 훅)에서도 부를 수 있는 전역 토스트 저장소.
import { useSyncExternalStore } from 'react'

export type ToastTone = 'success' | 'warning' | 'error' | 'info'
export type Toast = { id: number; tone: ToastTone; title: string; message?: string }

const DURATION_MS: Record<ToastTone, number> = { success: 4000, info: 4000, warning: 6000, error: 8000 }
const MAX_TOASTS = 4

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit(next: Toast[]) {
  toasts = next
  listeners.forEach((l) => l())
}

export function dismissToast(id: number) {
  emit(toasts.filter((t) => t.id !== id))
}

export function toast(tone: ToastTone, title: string, message?: string) {
  const id = nextId++
  emit([...toasts, { id, tone, title, message }].slice(-MAX_TOASTS))
  setTimeout(() => dismissToast(id), DURATION_MS[tone])
}

export function useToasts() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => toasts,
  )
}
