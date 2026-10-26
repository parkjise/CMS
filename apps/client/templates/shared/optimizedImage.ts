/**
 * 템플릿 이미지 최적화 — <img> 마크업(목업 레이아웃·비율)은 그대로 두고
 * src/srcSet 만 Next 이미지 최적화(/_next/image)로 바꿔 화면 폭에 맞는 webp/avif 를 받는다 (T-125).
 * next.config 의 기본 deviceSizes 와 같은 폭만 쓴다. 외부 주소(유튜브 썸네일 등)는 그대로.
 */
const WIDTHS = [640, 750, 828, 1080, 1200, 1920, 2048]
const QUALITY = 75

const isLocal = (src: string) => src.startsWith('/') && !src.startsWith('//')

const optimized = (src: string, width: number) =>
  `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${QUALITY}`

export interface OptimizedImgProps {
  src: string
  srcSet?: string
  sizes?: string
}

/**
 * @param sizes 화면에서 차지하는 폭 (예: '100vw', '(min-width: 1024px) 33vw, 80vw')
 * @param maxWidth 이 폭보다 큰 후보는 만들지 않는다 (작은 썸네일 등)
 */
export function optimizedImg(src: string, sizes: string, maxWidth = 2048): OptimizedImgProps {
  if (!src || !isLocal(src) || src.endsWith('.svg')) return { src }
  const widths = WIDTHS.filter((w) => w <= maxWidth)
  const largest = widths.at(-1) ?? WIDTHS[0]
  return {
    src: optimized(src, largest),
    srcSet: widths.map((w) => `${optimized(src, w)} ${w}w`).join(', '),
    sizes,
  }
}
