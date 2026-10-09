import { Link } from 'react-router'
import { paths } from '../routes/paths'

const nav = [
  { href: '#realtime', label: '실시간' },
  { href: '#stats', label: '통계' },
  { href: '#analysis', label: '분석' },
]

type Props = {
  connected: boolean
  state: string
}

export default function DashboardHeader({ connected, state }: Props) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-header px-20 flex items-center justify-between bg-main-3 border-b border-divider shadow-card">
      <Link to={paths.landing}>
        <img src="/logo.png" alt="logo" className="h-8" />
      </Link>

      <nav className="absolute left-1/2 -translate-x-1/2 flex gap-10 tracking-[0.04em]">
        {nav.map(({ href, label }) => (
          <a key={href} href={href} className="hover:text-info">
            {label}
          </a>
        ))}
      </nav>

      <div className="flex h-8 items-center gap-2 rounded-full bg-border px-5">
        <span className="font-semibold">연결상태</span>
        <span className={`size-2.5 rounded-full ${connected ? 'bg-grade-high' : 'bg-grade-low'}`} />
        <span className="h-5 w-px bg-info" />
        <span className="font-semibold">상태</span>
        <span className="text-info">{state}</span>
      </div>
    </header>
  )
}
