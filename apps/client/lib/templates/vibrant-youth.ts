import type { TemplateTheme } from './types'

/** 원색 · 비대칭 그리드의 활기찬 템플릿 */
export const vibrantYouth: TemplateTheme = {
  key: 'vibrant-youth',
  name: '바이브런트 유스',
  description: '선명한 원색과 비대칭 그리드로 젊고 활기찬 분위기를 내는 템플릿',
  recommendedIndustry: 'STARTUP',
  minPlan: 'STANDARD',
  thumbnailUrl: '/templates/vibrant-youth.svg',
  cssVariables: {
    primary: '#ec4899',
    primary_hover: '#db2777',
    on_primary: '#ffffff',
    secondary: '#8b5cf6',
    accent: '#f59e0b',
    background: '#fffdf7',
    surface: '#ffffff',
    text_primary: '#18181b',
    text_secondary: '#52525b',
    border: '#ececf1',
    font_heading: 'Pretendard',
    font_body: 'Pretendard',
    border_radius: '16px',
  },
  sectionLayouts: ['HERO_BANNER', 'INTRO', 'SERVICES', 'PORTFOLIO', 'TEAM', 'CONTACT'],
}
