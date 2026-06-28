import type { TemplateTheme } from './types'

/** 그린 계열 · 매거진형 레이아웃의 자연 친화 템플릿 */
export const natureFresh: TemplateTheme = {
  key: 'nature-fresh',
  name: '네이처 프레시',
  description: '싱그러운 그린 컬러와 매거진형 구성으로 자연스러움을 강조하는 템플릿',
  recommendedIndustry: 'PENSION',
  minPlan: 'BASIC',
  thumbnailUrl: '/templates/nature-fresh.svg',
  cssVariables: {
    primary: '#16a34a',
    primary_hover: '#15803d',
    on_primary: '#ffffff',
    secondary: '#dcfce7',
    accent: '#65a30d',
    background: '#f7fdf9',
    surface: '#ffffff',
    text_primary: '#14342b',
    text_secondary: '#4b5d54',
    border: '#d7e8de',
    font_heading: 'Noto Serif KR',
    font_body: 'Noto Sans KR',
    border_radius: '6px',
  },
  sectionLayouts: ['HERO_BANNER', 'INTRO', 'GALLERY', 'RESERVATION', 'FAQ', 'MAP'],
}
