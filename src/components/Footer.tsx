import { Fragment } from "react";
import { FaGithub } from "react-icons/fa6";

// "·" 로 이은 목록. 좁은 화면에서는 항목 단위로만 줄을 바꾼다.
function Dotted({ items }: { items: string[] }) {
  return (
    <p className="break-keep font-light text-sm text-white/60">
      {items.map((item, i) => (
        <Fragment key={item}>
          <span className="whitespace-nowrap">
            {item}
            {i < items.length - 1 && ' ·'}
          </span>
          {/* 공백은 span 밖에 둬야 그 자리에서 줄이 바뀐다 */}
          {i < items.length - 1 && ' '}
        </Fragment>
      ))}
    </p>
  )
}

export default function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-border shadow-[0_0_20px_rgba(0,0,0,0.3)]">
      <img
        src="/ftBg.webp"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover blur-[120px]"
      />
      <div className="relative px-4 py-10 lg:px-20 lg:py-16 flex flex-col gap-8 lg:gap-10">
        <div className="flex items-start justify-between gap-4">
          <img src="/icon.webp" alt="logo" className="h-12 lg:h-16 shrink-0" />
          <a
            href="https://github.com/IAMSSORRY"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            className="shrink-0"
          >
            <FaGithub className="size-12 lg:size-16" />
          </a>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="break-keep font-semibold text-lg lg:text-xl">암쏘사과 - SSORRY</h3>
          <h3 className="break-keep font-medium text-lg lg:text-xl">판정 근거를 제시하는 사과 선별 시스템</h3>
        </div>

        <div className="flex flex-col gap-2">
          <p className="break-keep font-light text-sm text-white/60">PAC 2026 Physical AI Challenge</p>
          <Dotted items={['분과① 로보틱스 미션', '안동청과 기업문제 해결', '고등부']} />
          <p className="break-keep font-light text-sm text-white/60">2026.10.09 - 10.10</p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="break-keep font-light text-sm text-white/60">이도건 — 랜딩페이지 · 로봇 제어</p>
          <p className="break-keep font-light text-sm text-white/60">김준현 — Full Stack</p>
          <p className="break-keep font-light text-sm text-white/60">대구소프트웨어마이스터고등학교</p>
        </div>
        
        <Dotted items={['Piper Studio', 'Python', 'OpenCV', 'React', 'TypeScript']} />

        <p className="break-keep font-light text-sm text-white/60">© 2026 암쏘사과</p>
      </div>
    </footer>
  )
}
