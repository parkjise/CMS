import { readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { compile } from 'sass'
import { describe, expect, it } from 'vitest'
import { CODE_TEMPLATES } from '@/templates/registry'

/**
 * SCSS 코드형 템플릿 스타일 검사 (기획서 11.7 스타일 격리 · T-119)
 * - 모든 규칙이 [data-template='{key}'] 아래 + @layer template 안에 있어야 한다
 * - 클래스 이름이 Tailwind 유틸리티와 겹치면 안 된다
 *   (utilities 레이어가 template 레이어보다 뒤라서, 겹치면 Tailwind 규칙이 이긴다 — 예: .container)
 */
const TAILWIND_WORDS = new Set([
  'container', 'grid', 'flex', 'hidden', 'block', 'inline', 'inline-block', 'inline-flex',
  'inline-grid', 'contents', 'table', 'flow-root', 'truncate', 'border', 'rounded', 'shadow',
  'italic', 'underline', 'uppercase', 'lowercase', 'capitalize', 'static', 'fixed', 'absolute',
  'relative', 'sticky', 'visible', 'invisible', 'collapse', 'isolate', 'outline', 'ring', 'blur',
  'grow', 'shrink', 'transform', 'transition', 'filter', 'antialiased', 'group', 'peer',
  'not-sr-only', 'columns', 'aspect-square', 'aspect-video', 'line-through', 'ordinal',
])
// Tailwind 과 이름·의미가 같아 겹쳐도 되는 클래스
const ALLOWED = new Set(['sr-only'])

const root = resolve(__dirname, '..')
const scssTemplates = CODE_TEMPLATES.filter((t) => t.manifest.styling === 'scss')

describe('SCSS 코드형 템플릿 스타일 격리 (T-119)', () => {
  it('SCSS 템플릿이 하나 이상 등록돼 있다', () => {
    expect(scssTemplates.length).toBeGreaterThan(0)
  })

  for (const { manifest } of scssTemplates) {
    const entry = resolve(root, 'templates', manifest.key, 'styles', 'index.scss')

    it(`${manifest.key}: styles/index.scss 엔트리가 있다`, () => {
      expect(existsSync(entry)).toBe(true)
      expect(readdirSync(resolve(root, 'templates', manifest.key, 'styles'))).toContain('index.scss')
    })

    const css = existsSync(entry) ? compile(entry, { style: 'expanded' }).css : ''

    it(`${manifest.key}: 레이어 순서를 globals.css 와 같게 선언한다`, () => {
      expect(css).toContain('@layer theme, base, components, template, utilities;')
      expect(css).toMatch(/@layer template\s*\{/)
    })

    it(`${manifest.key}: 템플릿 레이어 규칙은 모두 data-template 루트 아래에 있다`, () => {
      const templateBlock = css.slice(css.search(/@layer template\s*\{/))
      const selectors = [...templateBlock.matchAll(/^\s*([^@\s{}][^{}]*?)\s*\{/gm)]
        .map((m) => m[1].trim())
        .filter((s) => !s.startsWith('@'))
      expect(selectors.length).toBeGreaterThan(50)
      const unscoped = selectors
        .flatMap((s) => s.split(','))
        .map((s) => s.trim())
        // @keyframes 안의 단계(from · to · 0% …)는 선택자가 아니다
        .filter((s) => s && !/^(from|to|\d+(\.\d+)?%)$/.test(s))
        .filter((s) => !s.startsWith(`[data-template=${manifest.key}]`))
      expect(unscoped).toEqual([])
    })

    it(`${manifest.key}: Tailwind 유틸리티와 같은 클래스 이름을 쓰지 않는다`, () => {
      const templateBlock = css.slice(css.search(/@layer template\s*\{/))
      const classes = new Set([...templateBlock.matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)].map((m) => m[1]))
      const collisions = [...classes].filter((c) => TAILWIND_WORDS.has(c) && !ALLOWED.has(c))
      expect(collisions).toEqual([])
    })
  }
})
