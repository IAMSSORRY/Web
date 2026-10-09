import { useRef } from 'react'
import { Link } from 'react-router'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import ImageCard from '../components/ImageCard'
import { paths } from '../routes/paths'

gsap.registerPlugin(useGSAP, ScrollTrigger)

type Feature = {
  title: string
  lead: string
  body: string[]
  image: string
  alt: string
}

const features: Feature[] = [
  {
    title: '조건을 고정합니다',
    lead: '트레이 위에서 바로 색을 보지 않습니다.',
    body: [
      '사과마다 카메라와의 거리, 각도, 받는 조명이 다르면 같은 사과도 다른 색으로 측정됩니다.',
      '암쏘사과는 사과를 집어 조명이 통제된 검사 위치로 옮긴 뒤 판별합니다.',
      '모든 사과가 같은 조건에서 평가됩니다.',
    ],
    image: '/landing/condition.webp',
    alt: '고정 카메라로 본 트레이와 로봇팔',
  },
  {
    title: '근거를 함께 보여줍니다',
    lead: '판정에 쓰인 색상값, 임계값, 신뢰도를 실시간으로 표시합니다.',
    body: [
      '결과만 보는 자동화는 현장이 믿지 못합니다.',
      '판정 과정이 눈에 보이면 사람이 확인할 수 있고,',
      '확인할 수 있어야 맡길 수 있습니다.',
    ],
    image: '/landing/evidence.webp',
    alt: '대시보드의 사과 정보와 신뢰도 게이지',
  },
  {
    title: '손상을 스스로 검증합니다',
    lead: '적재 직후 영상으로 사과를 떨어뜨렸는지 감지합니다.',
    body: [
      '떨어뜨림이 감지되면 다음 동작의 접근 속도와 적재 높이를 자동으로 낮춥니다.',
      '현장의 상자와 사과가 예상과 달라도 시스템이 맞춰 들어갑니다.',
    ],
    image: '/landing/damage.webp',
    alt: '대시보드의 미션 진행 현황',
  },
  {
    title: '쌓인 데이터로 흐름을 읽습니다',
    lead: '처리한 사과의 등급 분포를 누적해 기록합니다.',
    body: [
      '한 번의 선별로 끝나지 않습니다.',
      '선별 이력과 연동하면 기간별 품질 변화를 비교하고,',
      '수확 시기나 산지의 변화를 데이터로 확인할 수 있습니다.',
    ],
    image: '/landing/data.webp',
    alt: '대시보드의 등급별 통계와 회차 기록',
  },
]

export default function Landing() {
  const root = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()

      // 움직임 줄이기 설정이면 애니메이션 없이 그대로 보여준다
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const rise = { y: 40, autoAlpha: 0, duration: 0.8, ease: 'power2.out' }

        // hero: 이미지가 먼저 올라오고 글이 뒤따른다
        gsap
          .timeline()
          .from('[data-hero-card]', rise)
          .from('[data-hero-text] > *', { ...rise, stagger: 0.12 }, '-=0.4')

        // 기능 섹션: 화면에 들어오면 이미지 → 글 순서로 올라온다
        gsap.utils.toArray<HTMLElement>('[data-feature]').forEach((section) => {
          gsap
            .timeline({ scrollTrigger: { trigger: section, start: 'top 75%', once: true } })
            .from(section.querySelector('[data-card]'), rise)
            .from(section.querySelectorAll('[data-text] > *'), { ...rise, stagger: 0.12 }, '-=0.4')
        })
      })
    },
    { scope: root },
  )

  return (
    <div ref={root} className="flex flex-col gap-10">
      {/* hero */}
      <div className="flex flex-col-reverse gap-8 md:flex-row md:justify-between md:items-center px-4 py-10 md:px-20 md:py-16">
        <div data-hero-text className="flex flex-col gap-8">
          <div className="flex flex-col gap-4">
            <h1 className="text-2xl md:text-4xl font-semibold">
              암쏘사과는 판정 근거를 제시하는<br />사과 선별 시스템입니다.
            </h1>
            <p className="text-info">등급만 내놓지 않고, 왜 그 등급인지를 함께 보여줍니다.</p>
          </div>
          <Link
            to={paths.dashboard}
            className="self-start bg-white text-black text-base md:text-lg font-semibold px-6 md:px-8 py-3 rounded-full shadow-[0_0_20px_rgba(255,255,255,0.5)]"
          >
            바로가기 →
          </Link>
        </div>
        <div data-hero-card>
          <ImageCard src="/landing/hero.webp" alt="암쏘사과 대시보드 실시간 화면" />
        </div>
      </div>

      {features.map((f, i) => {
        const imageFirst = i % 2 === 0
        const card = (
          // 휴대폰에서는 섹션마다 이미지를 위에 둔다
          <div data-card className="order-first md:order-none">
            <ImageCard src={f.image} alt={f.alt} />
          </div>
        )
        return (
          <div
            key={f.title}
            data-feature
            className={`flex flex-col gap-6 px-4 py-8 md:flex-row md:items-center md:px-20 ${imageFirst ? 'bg-main-2 md:gap-24' : 'md:justify-between'}`}
          >
            {imageFirst && card}
            <div data-text className="flex flex-col gap-4">
              <h1 className="text-2xl md:text-4xl font-semibold">{f.title}</h1>
              <p className="text-info">{f.lead}</p>
              <p className="text-info">
                {f.body.map((line, j) => (
                  <span key={j}>
                    {line}
                    {j < f.body.length - 1 && <br />}
                  </span>
                ))}
              </p>
            </div>
            {!imageFirst && card}
          </div>
        )
      })}
    </div>
  )
}
