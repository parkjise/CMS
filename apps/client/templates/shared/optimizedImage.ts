/**
 * 템플릿 이미지 최적화 — <img> 마크업(목업 레이아웃·비율)은 그대로 두고
 * src/srcSet 만 Next 이미지 최적화(/_next/image)로 바꿔 화면 폭에 맞는 webp/avif 를 받는다 (T-125).
 * next.config 의 기본 deviceSizes 와 같은 폭만 쓴다. 스토리지(MinIO · CDN) 주소도 변환,
 * 그 밖의 외부 주소(유튜브 썸네일 등)는 그대로.
 */
const WIDTHS = [640, 750, 828, 1080, 1200, 1920, 2048]
const QUALITY = 75

const isLocal = (src: string) => src.startsWith('/') && !src.startsWith('//')

/**
 * next.config images.remotePatterns 와 같은 스토리지 주소 — 공용 템플릿 샘플 이미지
 * (TEMPLATE_ASSET_BASE_URL, T-120) · 테넌트 업로드 이미지. 여기 없는 외부 주소는 변환하지 않는다
 */
const STORAGE_ORIGINS = [
  'http://localhost:9000',
  ...(process.env.NEXT_PUBLIC_CDN_HOSTNAME ? [`https://${process.env.NEXT_PUBLIC_CDN_HOSTNAME}`] : []),
]

const isStorage = (src: string) => STORAGE_ORIGINS.some((origin) => src.startsWith(`${origin}/`))

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
  if (!src || !(isLocal(src) || isStorage(src)) || /\.svg($|\?)/.test(src)) return { src }
  const widths = WIDTHS.filter((w) => w <= maxWidth)
  const largest = widths.at(-1) ?? WIDTHS[0]
  return {
    src: optimized(src, largest),
    srcSet: widths.map((w) => `${optimized(src, w)} ${w}w`).join(', '),
    sizes,
  }
}
