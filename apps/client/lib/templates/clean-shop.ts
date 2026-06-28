import type { TemplateTheme } from './types'

/** 화이트 · 상품 중심 레이아웃의 깔끔한 쇼핑 템플릿 */
export const cleanShop: TemplateTheme = {
  key: 'clean-shop',
  name: '클린 샵',
  description: '화이트 배경과 상품 중심 구성으로 제품을 돋보이게 하는 템플릿',
  recommendedIndustry: 'GENERAL',
  minPlan: 'BASIC',
  thumbnailUrl: '/templates/clean-shop.svg',
  cssVariables: {
    primary: '#111827',
    primary_hover: '#000000',
    on_primary: '#ffffff',
    secondary: '#f3f4f6',
    accent: '#2563eb',
    background: '#ffffff',
    surface: '#f9fafb',
    text_primary: '#111827',
    text_secondary: '#6b7280',
    border: '#e5e7eb',
    font_heading: 'Pretendard',
    font_body: 'Pretendard',
    border_radius: '8px',
  },
  sectionLayouts: ['HERO_BANNER', 'INTRO', 'SERVICES', 'GALLERY', 'CONTACT'],
}
