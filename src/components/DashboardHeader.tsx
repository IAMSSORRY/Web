import { Link } from 'react-router'
import { paths } from '../routes/paths'

const nav = [
  { href: '#realtime', label: '실시간' },
  { href: '#stats', label: '통계' },
  { href: '#analysis', label: '분석' },
]

// ok: 전부 정상, warn: 서버는 살아 있지만 카메라나 판정 스트림이 끊김, down: 서버 응답 없음
export type Connection = 'ok' | 'warn' | 'down'

const dotColor: Record<Connection, string> = {
  ok: 'bg-grade-high',
  warn: 'bg-grade-mid',
  down: 'bg-grade-low',
}

type Props = {
  connection: Connection
  state: string
  // 마우스를 올리면 보이는 원인 설명
  detail?: string
  onEstop: () => void
  // 정리 후 정지 중이면 비상정지 버튼을 더 눈에 띄게 한다(정리를 버리고 즉시 멈출 수 있다).
  emphasizeEstop: boolean
  // 로봇 미션 프로그램에 닿지 못하면 웹 비상정지가 로봇까지 가지 않는다. 버튼은 막지 않고(다시 연결되면 바로 써야 하므로) 알리기만 한다.
  robotOffline: boolean
}

export default function DashboardHeader({ connection, state, detail, onEstop, emphasizeEstop, robotOffline }: Props) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-header px-4 lg:px-20 flex items-center justify-between gap-3 bg-main-2/50 border-b border-border shadow-[0_0_20px_rgba(0,0,0,0.3)] backdrop-blur-xl">
      <Link to={paths.landing}>
        <img src="/logo.webp" alt="logo" className="h-6 lg:h-8" />
      </Link>

      <nav className="absolute left-1/2 hidden -translate-x-1/2 gap-10 tracking-[0.04em] lg:flex">
        {nav.map(({ href, label }) => (
          <a key={href} href={href} className="hover:text-info">
            {label}
          </a>
        ))}
      </nav>

      <div className="flex min-w-0 items-center gap-2 lg:gap-3">
      <div title={detail} className="flex h-8 min-w-0 items-center gap-2 rounded-full bg-border px-3 lg:px-5">
        {/* 휴대폰에서는 라벨을 빼고 점과 상태만 보여준다 */}
        <span className="hidden font-semibold lg:inline">연결상태</span>
        <span className={`size-2.5 rounded-full transition-colors ${dotColor[connection]}`} />
        <span className="hidden h-5 w-px bg-info lg:inline" />
        <span className="hidden font-semibold lg:inline">상태</span>
        <span className={`truncate text-sm lg:text-base ${connection === 'ok' ? 'text-info' : 'text-white'}`}>{state}</span>
      </div>
      {/* 비상 상황용이라 확인 없이 바로 보낸다. 응답을 기다리는 동안에도 다시 누를 수 있다. */}
      <button
        onClick={onEstop}
        title={robotOffline ? '로봇 미션 프로그램에 연결되지 않아 웹 비상정지가 로봇에 전달되지 않습니다. 로봇 PC 에서 직접 멈추세요.' : undefined}
        className={`h-8 shrink-0 rounded-full bg-grade-low px-4 text-sm font-semibold text-white hover:brightness-110 active:brightness-90 lg:px-5 lg:text-base ${
          emphasizeEstop ? 'animate-pulse ring-4 ring-grade-low/50' : ''
        }`}
      >
        비상정지
        {robotOffline && <span className="ml-1 text-xs font-normal opacity-80">(연결 끊김)</span>}
      </button>
      </div>
    </header>
  )
}
