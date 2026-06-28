import { cleanShop } from './clean-shop'
import { modernMinimal } from './modern-minimal'
import { natureFresh } from './nature-fresh'
import { professional } from './professional'
import type { TemplateKey, TemplateTheme } from './types'
import { vibrantYouth } from './vibrant-youth'
import { warmTrust } from './warm-trust'

/** 기본 제공 템플릿 6종 레지스트리 */
export const TEMPLATE_THEMES: TemplateTheme[] = [
  modernMinimal,
  warmTrust,
  natureFresh,
  professional,
  vibrantYouth,
  cleanShop,
]

const BY_KEY: Record<TemplateKey, TemplateTheme> = TEMPLATE_THEMES.reduce(
  (acc, theme) => {
    acc[theme.key] = theme
    return acc
  },
  {} as Record<TemplateKey, TemplateTheme>,
)

export function getTemplateTheme(key: string): TemplateTheme | undefined {
  return BY_KEY[key as TemplateKey]
}

export type { TemplateTheme, TemplateKey } from './types'
