import { Outlet, useLocation } from 'react-router'
import Footer from '../components/Footer'
import Header from '../components/Header'
import { paths } from '../routes/paths'

function RootLayout() {
  const { pathname } = useLocation()

  return (
    <div className="flex min-h-dvh flex-col">
      {/* 대시보드는 연결 상태를 보여주는 자체 헤더를 쓴다 */}
      {pathname !== paths.dashboard && <Header />}
      {/* 헤더가 fixed라 흐름에서 빠지므로 헤더 높이만큼 밀어준다 */}
      <main className="flex-1 pt-header">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

export default RootLayout
