import type { ImgHTMLAttributes } from 'react'
import { MOBILE_MEDIA } from '@/lib/mobileSettings'
import { optimizedImg } from './optimizedImage'

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet' | 'sizes'> {
  src: string
  /** 휴대폰용 사진 (관리자 모바일 설정, T-037-D) — 없으면 PC 사진만 */
  mobileSrc?: string
  sizes: string
  maxWidth?: number
}

/**
 * 템플릿 이미지 — 휴대폰용 사진이 있으면 <picture> 로 휴대폰(767px 이하)에서 그 사진을 받는다.
 * <img> 의 클래스 · 크기 규칙(목업 SCSS)은 그대로 — <picture> 는 display: contents 라
 * 상자를 만들지 않아 grid 칸 배치(슬라이드) · 절대 위치(서브 상단) 모두 img 기준 그대로다.
 */
export function ResponsiveImg({ src, mobileSrc, sizes, maxWidth = 2048, alt = '', ...rest }: Props) {
  // eslint-disable-next-line @next/next/no-img-element -- 목업 마크업(object-fit) 유지
  const img = <img {...optimizedImg(src, sizes, maxWidth)} alt={alt} {...rest} />
  if (!mobileSrc) return img
  const mobile = optimizedImg(mobileSrc, '100vw', 1080)
  return (
    <picture className="contents">
      <source media={MOBILE_MEDIA} srcSet={mobile.srcSet ?? mobile.src} sizes="100vw" />
      {img}
    </picture>
  )
}
