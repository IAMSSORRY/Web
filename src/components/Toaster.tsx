import { dismissToast, useToasts, type ToastTone } from '../lib/toast'

const bar: Record<ToastTone, string> = {
  success: 'bg-grade-high',
  warning: 'bg-grade-mid',
  error: 'bg-grade-low',
  info: 'bg-info',
}

export default function Toaster() {
  const toasts = useToasts()

  return (
    <div aria-live="polite" className="fixed inset-x-4 bottom-4 z-50 flex flex-col gap-3 lg:inset-x-auto lg:bottom-6 lg:right-6 lg:w-96">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className="flex overflow-hidden rounded-xl border border-border bg-main-3 shadow-card animate-[toast-in_200ms_ease-out]"
        >
          <span className={`w-1 shrink-0 ${bar[t.tone]}`} />
          <div className="flex flex-1 flex-col gap-1 px-4 py-3">
            <p className="font-semibold">{t.title}</p>
            {t.message && <p className="text-sm text-info">{t.message}</p>}
          </div>
          <button
            onClick={() => dismissToast(t.id)}
            aria-label="닫기"
            className="self-start px-3 py-3 text-info hover:text-white"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
