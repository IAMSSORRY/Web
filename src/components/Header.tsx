import { Link } from 'react-router'
import { paths } from '../routes/paths'

export default function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-header px-20 flex justify-between items-center bg-main-2/50 border-b border-border shadow-[0_0_20px_rgba(0,0,0,0.3)] backdrop-blur-xl">
      <Link to={paths.landing}>
        <img src="/logo.png" alt="logo" className="h-8" />
      </Link>
      <Link
        to={paths.dashboard}
        className="bg-white text-black font-semibold px-6 py-2 rounded-full shadow-[0_0_20px_rgba(255,255,255,0.5)]"
      >
        바로가기
      </Link>
    </header>
  )
}
