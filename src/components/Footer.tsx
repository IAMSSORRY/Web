import { FaGithub } from "react-icons/fa6";

export default function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-border shadow-[0_0_20px_rgba(0,0,0,0.3)]">
      <img
        src="/ftBg.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover blur-[120px]"
      />
      <div className="relative px-20 py-16 flex flex-col gap-10">
        <div className="flex items-start justify-between gap-4">
          <img src="/icon.png" alt="logo" className="h-16 shrink-0" />
          <a
            href="https://github.com/IAMSSORRY"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            className="shrink-0"
          >
            <FaGithub className="size-16" />
          </a>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="font-semibold text-xl">암쏘사과 - SSORRY</h3>
          <h3 className="font-medium text-xl">판정 근거를 제시하는 사과 선별 시스템</h3>
        </div>

        <div className="flex flex-col gap-2">
          <p className="font-light text-sm text-white/60">PAC 2026 Physical AI Challenge</p>
          <p className="font-light text-sm text-white/60" >분과① 로보틱스 미션 · 안동청과 기업문제 해결 · 고등부</p>
          <p className="font-light text-sm text-white/60">2026.10.09 - 10.10</p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="font-light text-sm text-white/60">이도건 — 대시보드 · 로봇 제어</p>
          <p className="font-light text-sm text-white/60">김준현 — 비전 · 데이터 처리</p>
          <p className="font-light text-sm text-white/60">대구소프트웨어마이스터고등학교</p>
        </div>
        
        <p className="font-light text-sm text-white/60">ROS2 · Python · OpenCV · React · TypeScript</p>

        <p className="font-light text-sm text-white/60">© 2026 암쏘사과</p>
      </div>
    </footer>
  )
}
