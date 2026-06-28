import type { TemplateTheme } from './types'

/** 네이비·골드 · 사이드바 레이아웃의 전문가형 템플릿 */
export const professional: TemplateTheme = {
  key: 'professional',
  name: '프로페셔널',
  description: '네이비와 골드의 격조 있는 배색과 사이드바 구성의 전문가형 템플릿',
  recommendedIndustry: 'GENERAL',
  minPlan: 'STANDARD',
  thumbnailUrl: '/templates/professional.svg',
  cssVariables: {
    primary: '#1e3a5f',
    primary_hover: '#152b47',
    on_primary: '#ffffff',
    secondary: '#eef2f7',
    accent: '#c9a227',
    background: '#f8fafc',
    surface: '#ffffff',
    text_primary: '#0f172a',
    text_secondary: '#475569',
    border: '#e2e8f0',
    font_heading: 'Pretendard',
    font_body: 'Pretendard',
    border_radius: '2px',
  },
  sectionLayouts: ['HERO_BANNER', 'INTRO', 'SERVICES', 'TEAM', 'CONTACT', 'MAP'],
}
