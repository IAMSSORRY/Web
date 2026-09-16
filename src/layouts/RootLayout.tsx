import { Outlet } from 'react-router'
import Footer from '../components/Footer'
import Header from '../components/Header'

function RootLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      {/* 헤더가 fixed라 흐름에서 빠지므로 헤더 높이만큼 밀어준다 */}
      <main className="flex-1 pt-header">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

export default RootLayout
