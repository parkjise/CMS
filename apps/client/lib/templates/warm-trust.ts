import type { TemplateTheme } from './types'

/** 웜톤 · 분할 레이아웃의 신뢰감 있는 템플릿 */
export const warmTrust: TemplateTheme = {
  key: 'warm-trust',
  name: '웜 트러스트',
  description: '따뜻한 색감과 분할 레이아웃으로 신뢰감을 전하는 템플릿',
  recommendedIndustry: 'HOSPITAL',
  minPlan: 'BASIC',
  thumbnailUrl: '/templates/warm-trust.svg',
  cssVariables: {
    primary: '#d97706',
    primary_hover: '#b45309',
    on_primary: '#ffffff',
    secondary: '#fde68a',
    accent: '#ea580c',
    background: '#fffaf3',
    surface: '#ffffff',
    text_primary: '#1c1917',
    text_secondary: '#78716c',
    border: '#e7e5e4',
    font_heading: 'Noto Sans KR',
    font_body: 'Noto Sans KR',
    border_radius: '10px',
  },
  sectionLayouts: ['HERO_BANNER', 'INTRO', 'SERVICES', 'TEAM', 'FAQ', 'CONTACT'],
}
