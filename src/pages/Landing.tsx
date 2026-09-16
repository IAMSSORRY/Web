import { Link } from 'react-router'
import ImageCard from '../components/ImageCard'
import { paths } from '../routes/paths'

export default function Landing() {
  return (
    <div className="flex flex-col gap-10">
      {/* hero */}
      <div className="flex justify-between items-center px-20 py-16">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-4">
            <h1 className="text-4xl font-semibold">
              암쏘사과는 판정 근거를 제시하는<br />사과 선별 시스템입니다.
            </h1>
            <p className="text-info">등급만 내놓지 않고, 왜 그 등급인지를 함께 보여줍니다.</p>
          </div>
          <Link
            to={paths.dashboard}
            className="self-start bg-white text-black text-lg font-semibold px-8 py-3 rounded-full shadow-[0_0_20px_rgba(255,255,255,0.5)]"
          >
            바로가기 →
          </Link>
        </div>
        <ImageCard />
      </div>

      <div className="flex gap-24 items-center px-20 py-8 bg-main-2">
        <ImageCard />
        <div className="flex flex-col gap-4">
          <h1 className="text-4xl font-semibold">조건을 고정합니다</h1>
          <p className="text-info">트레이 위에서 바로 색을 보지 않습니다.</p>
          <p className="text-info">
            사과마다 카메라와의 거리, 각도, 받는 조명이 다르면 같은 사과도 다른 색으로 측정됩니다.<br />
            암쏘사과는 사과를 집어 조명이 통제된 검사 위치로 옮긴 뒤 판별합니다.<br />
            모든 사과가 같은 조건에서 평가됩니다.
          </p>
        </div>
      </div>

      <div className="flex justify-between items-center px-20 py-8">
        <div className="flex flex-col gap-4">
          <h1 className="text-4xl font-semibold">근거를 함께 보여줍니다</h1>
          <p className="text-info">판정에 쓰인 색상값, 임계값, 신뢰도를 실시간으로 표시합니다.</p>
          <p className="text-info">
            결과만 보는 자동화는 현장이 믿지 못합니다. <br />
            판정 과정이 눈에 보이면 사람이 확인할 수 있고, <br />
            확인할 수 있어야 맡길 수 있습니다.
          </p>
        </div>
        <ImageCard />
      </div>

      <div className="flex gap-24 items-center px-20 py-8 bg-main-2">
        <ImageCard />
        <div className="flex flex-col gap-4">
          <h1 className="text-4xl font-semibold">손상을 스스로 검증합니다</h1>
          <p className="text-info">적재 직후 영상으로 사과의 굴림을 감지합니다.</p>
          <p className="text-info">
            굴림이 발생하면 다음 동작의 접근 속도와 적재 높이를 자동으로 낮춥니다. <br />
            현장의 상자와 사과가 예상과 달라도 시스템이 맞춰 들어갑니다.
          </p>
        </div>
      </div>

      <div className="flex justify-between items-center px-20 py-8">
        <div className="flex flex-col gap-4">
          <h1 className="text-4xl font-semibold">쌓인 데이터로 흐름을 읽습니다</h1>
          <p className="text-info">처리한 사과의 등급 분포를 누적해 기록합니다.</p>
          <p className="text-info">
            한 번의 선별로 끝나지 않습니다. <br />
            선별 이력과 연동하면 기간별 품질 변화를 비교하고, <br />
            수확 시기나 산지의 변화를 데이터로 확인할 수 있습니다.
          </p>
        </div>
        <ImageCard />
      </div>
    </div>
  )
}
