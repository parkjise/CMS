/**
 * 시드/DB에 저장된 css_variables(짧은 키)와 기획서 표준 키를
 * CSS 변수명(`--color-primary` 등)으로 정규화한다.
 */
const KEY_MAP: Record<string, string> = {
  // 색 (짧은 키)
  primary: '--color-primary',
  primary_hover: '--color-primary-hover',
  on_primary: '--color-on-primary',
  secondary: '--color-secondary',
  accent: '--color-accent',
  background: '--color-background',
  surface: '--color-surface',
  surface_strong: '--color-surface-strong',
  text_primary: '--color-text-primary',
  text_secondary: '--color-text-secondary',
  text_muted: '--color-text-muted',
  text_subtle: '--color-text-subtle',
  border: '--color-border',
  border_strong: '--color-border-strong',
  danger: '--color-danger',
  warning: '--color-warning',
  overlay: '--color-overlay',

  // 색 (기획서 표준 키)
  color_primary: '--color-primary',
  color_secondary: '--color-secondary',
  color_accent: '--color-accent',
  color_background: '--color-background',
  color_surface: '--color-surface',
  color_text_primary: '--color-text-primary',
  color_text_secondary: '--color-text-secondary',

  // 폰트
  font_heading: '--font-heading',
  font_body: '--font-body',
  font_size_base: '--font-size-base',
  font_weight_heading: '--font-weight-heading',

  // 모서리/그림자
  border_radius: '--border-radius-base',
  border_radius_base: '--border-radius-base',
  border_radius_card: '--border-radius-card',
  shadow_card: '--shadow-card',

  // 간격
  spacing_section: '--spacing-section',
  spacing_container: '--spacing-container',
}

const UNSAFE_VALUE_RE = /[<>{};]/
const MAX_VALUE_LENGTH = 120

function normalizeKey(rawKey: string): string | null {
  const mapped = KEY_MAP[rawKey]
  if (mapped) return mapped
  // 안전한 키만 그대로 통과 (영소문자/숫자/하이픈/언더스코어)
  if (/^[a-z][a-z0-9_-]*$/.test(rawKey)) {
    return `--${rawKey.replace(/_/g, '-')}`
  }
  return null
}

function sanitizeValue(rawValue: unknown): string | null {
  if (typeof rawValue !== 'string') return null
  const trimmed = rawValue.trim()
  if (!trimmed) return null
  if (trimmed.length > MAX_VALUE_LENGTH) return null
  if (UNSAFE_VALUE_RE.test(trimmed)) return null
  return trimmed
}

/**
 * css_variables 객체를 `:root { --key: value; ... }` 본문으로 변환.
 * 안전하지 않은 키/값은 무시한다.
 */
export function buildCssVarBody(
  cssVariables: Record<string, unknown> | null | undefined,
): string {
  if (!cssVariables) return ''
  const parts: string[] = []
  for (const [rawKey, rawValue] of Object.entries(cssVariables)) {
    const key = normalizeKey(rawKey)
    const value = sanitizeValue(rawValue)
    if (!key || !value) continue
    parts.push(`${key}: ${value};`)
  }
  return parts.join(' ')
}
