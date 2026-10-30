import { getString } from '@/lib/sectionSettings'
import type { PublicSection } from '@/lib/publicSite.types'

// 섹션 모바일 설정 (T-037-D) — 관리자 섹션 편집 → 모바일 설정 탭

/** 휴대폰(767px 이하)에서 숨기는 섹션인지 */
export const isMobileHidden = (section: Pick<PublicSection, 'settings'>): boolean =>
  getString(section.settings, 'mobile_hidden') === 'true'

/** 휴대폰용 배경 이미지 — 없으면 '' (PC 이미지를 그대로 쓴다) */
export const mobileImage = (section: Pick<PublicSection, 'settings'>): string =>
  getString(section.settings, 'mobile_image_url')

/** 휴대폰 화면 기준 — globals.css 의 숨김 규칙과 같은 폭 */
export const MOBILE_MEDIA = '(max-width: 767px)'
