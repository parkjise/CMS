import type { TemplateTheme } from './types'

/** 다크 계열 · 풀스크린 히어로의 미니멀 템플릿 */
export const modernMinimal: TemplateTheme = {
  key: 'modern-minimal',
  name: '모던 미니멀',
  description: '다크 계열과 풀스크린 히어로로 강렬한 첫인상을 주는 미니멀 템플릿',
  recommendedIndustry: 'STARTUP',
  minPlan: 'BASIC',
  thumbnailUrl: '/templates/modern-minimal.svg',
  cssVariables: {
    primary: '#6366f1',
    primary_hover: '#4f46e5',
    on_primary: '#ffffff',
    secondary: '#1e293b',
    accent: '#818cf8',
    background: '#0f172a',
    surface: '#1e293b',
    text_primary: '#f1f5f9',
    text_secondary: '#94a3b8',
    border: '#334155',
    font_heading: 'Pretendard',
    font_body: 'Pretendard',
    border_radius: '4px',
  },
  sectionLayouts: ['HERO_BANNER', 'INTRO', 'SERVICES', 'PORTFOLIO', 'CONTACT'],
}
