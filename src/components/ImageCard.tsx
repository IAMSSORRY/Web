import { useState } from 'react'

type ImageCardProps = {
  src?: string
  alt?: string
  fallback?: React.ReactNode
}

export default function ImageCard({
  src,
  alt = '',
  fallback = 
    <div className="flex flex-col items-center justify-center gap-6">
      <img src="warn.svg" alt="" />
      <p className='text-border text-xl font-medium'>이미지를 불러올 수 없습니다</p>
    </div>,
}: ImageCardProps) {
  const [failed, setFailed] = useState(false)

  return (
    <div className="w-160 h-80 bg-main-3 rounded-xl flex flex-col items-center justify-center overflow-hidden border border-border">
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        fallback
      )}
    </div>
  )
}
