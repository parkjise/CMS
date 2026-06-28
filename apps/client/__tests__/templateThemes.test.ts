import { describe, expect, it } from 'vitest'
import {
  TEMPLATE_THEMES,
  getTemplateTheme,
} from '@/lib/templates'
import { buildCssVarBody } from '@/lib/theme'

const EXPECTED_KEYS = [
  'modern-minimal',
  'warm-trust',
  'nature-fresh',
  'professional',
  'vibrant-youth',
  'clean-shop',
]
const VALID_PLANS = ['BASIC', 'STANDARD', 'PREMIUM']
const VALID_INDUSTRIES = ['HOSPITAL', 'PENSION', 'STARTUP', 'GENERAL']

describe('템플릿 테마 레지스트리 (T-056)', () => {
  it('정확히 6종을 제공하고 키가 고유하다', () => {
    expect(TEMPLATE_THEMES).toHaveLength(6)
    const keys = TEMPLATE_THEMES.map((t) => t.key)
    expect(new Set(keys).size).toBe(6)
    expect(keys.sort()).toEqual([...EXPECTED_KEYS].sort())
  })

  it('각 테마는 필수 메타데이터와 유효한 플랜/업종을 가진다', () => {
    for (const theme of TEMPLATE_THEMES) {
      expect(theme.name).toBeTruthy()
      expect(theme.description).toBeTruthy()
      expect(theme.thumbnailUrl).toMatch(/^\/templates\/.+\.svg$/)
      expect(VALID_PLANS).toContain(theme.minPlan)
      expect(VALID_INDUSTRIES).toContain(theme.recommendedIndustry)
      expect(theme.sectionLayouts.length).toBeGreaterThan(0)
    }
  })

  it('각 테마의 css 변수는 색/폰트/모서리 핵심 키를 포함한다', () => {
    for (const theme of TEMPLATE_THEMES) {
      const v = theme.cssVariables
      expect(v.primary).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(v.background).toBeTruthy()
      expect(v.text_primary).toBeTruthy()
      expect(v.font_heading).toBeTruthy()
      expect(v.border_radius).toBeTruthy()
    }
  })

  it('buildCssVarBody가 각 테마를 유효한 CSS 변수로 변환한다', () => {
    for (const theme of TEMPLATE_THEMES) {
      const body = buildCssVarBody(theme.cssVariables)
      expect(body).toContain('--color-primary:')
      expect(body).toContain('--font-heading:')
      expect(body).toContain('--border-radius-base:')
    }
  })

  it('getTemplateTheme으로 키 조회가 가능하고 없는 키는 undefined', () => {
    expect(getTemplateTheme('modern-minimal')?.name).toBe('모던 미니멀')
    expect(getTemplateTheme('does-not-exist')).toBeUndefined()
  })
})
