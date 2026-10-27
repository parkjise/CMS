import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import DeferredStylesheets from '@/templates/shared/DeferredStylesheets'

/**
 * 코드형 템플릿 모바일 성능 (T-125)
 * - Remix Icon 축소본: 소스에서 쓰는 아이콘이 모두 들어 있다 (새 아이콘 → pnpm icons:subset)
 * - 웹폰트 CSS 는 화면을 그린 뒤 적용, Typekit 은 font-display swap 으로
 * - 스토리지(MinIO · CDN) 이미지도 Next 이미지 변환
 * - 루트 레이아웃은 Noto Sans KR 을 불러오지 않는다 (코드형 템플릿 라우트 제외)
 */
const root = resolve(__dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('Remix Icon 축소본', () => {
  const css = read('templates/hospital-a/styles/remixicon-subset.css')

  it('소스에서 쓰는 아이콘이 모두 들어 있다', async () => {
    const { usedIcons } = await import('../scripts/remixicon-subset.mjs')
    const full = read('node_modules/remixicon/fonts/remixicon.css')
    const missing = (usedIcons() as string[]).filter(
      (name) => full.includes(`.${name}:before`) && !css.includes(`.${name}:before`),
    )
    expect(missing, '새 아이콘을 썼다면 pnpm icons:subset 을 실행하세요').toEqual([])
  })

  it('CSS 의 글리프 목록 = 규칙의 코드포인트, 축소 글꼴 파일 사용', () => {
    const glyphs = css.match(/glyphs: ([\w,]+)/)?.[1].split(',') ?? []
    const used = [...css.matchAll(/content: "\\(\w+)"/g)].map((m) => m[1])
    expect([...new Set(used)].sort()).toEqual(glyphs)
    expect(css).toContain('url("./remixicon-subset.woff2")')
    expect(statSync(resolve(root, 'templates/hospital-a/styles/remixicon-subset.woff2')).size).toBeLessThan(20_000)
  })

  it('템플릿은 원본 remixicon.css(3천여 개 규칙)를 불러오지 않는다', () => {
    const template = read('templates/hospital-a/Template.tsx')
    expect(template).not.toContain("remixicon/fonts/remixicon.css")
    expect(template).toContain("./styles/remixicon-subset.css")
  })
})

describe('Noto Sans KR 범위', () => {
  it('루트 레이아웃 · 코드형 템플릿 라우트에는 없고 테마형 레이아웃에만', () => {
    expect(read('app/layout.tsx')).not.toContain('next/font')
    expect(read('app/(code)/tpl-hospital-a/[tenant_slug]/layout.tsx')).toContain('TenantShell')
    expect(read('app/[tenant_slug]/TenantShell.tsx')).not.toContain('@/lib/fonts')
    expect(read('app/[tenant_slug]/layout.tsx')).toContain('notoSansKr')
  })
})

describe('DeferredStylesheets', () => {
  const GOOGLE = 'https://fonts.googleapis.com/css2?family=Test'
  const TYPEKIT = 'https://use.typekit.net/kit.css'
  const fetchMock = vi.fn()

  beforeEach(() => {
    document.head.innerHTML = ''
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('하이드레이션 후 <link> 로 붙인다 (preload 없음)', () => {
    render(<DeferredStylesheets hrefs={[GOOGLE]} />)
    const links = document.head.querySelectorAll(`link[rel="stylesheet"][href="${GOOGLE}"]`)
    expect(links).toHaveLength(1)
    expect(document.querySelector('link[rel="preload"]')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('같은 주소는 한 번만', () => {
    const { rerender } = render(<DeferredStylesheets hrefs={[GOOGLE]} />)
    rerender(<DeferredStylesheets hrefs={[GOOGLE]} />)
    render(<DeferredStylesheets hrefs={[GOOGLE]} />)
    expect(document.head.querySelectorAll('link[rel="stylesheet"]')).toHaveLength(1)
  })

  it('swapFontDisplay — font-display auto/block 을 swap 으로, @import 는 그대로', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        '@import url("https://p.typekit.net/p.css");\n' +
          '@font-face{font-family:"a";font-display:auto;}\n@font-face{font-family:"b";font-display: block;}',
      ),
    )
    render(<DeferredStylesheets hrefs={[GOOGLE, TYPEKIT]} swapFontDisplay={[TYPEKIT]} />)
    await waitFor(() => expect(document.head.querySelector(`style[data-href="${TYPEKIT}"]`)).not.toBeNull())
    const css = document.head.querySelector(`style[data-href="${TYPEKIT}"]`)?.textContent ?? ''
    expect(css).not.toMatch(/font-display:\s*(auto|block)/)
    expect(css.match(/font-display:swap/g)).toHaveLength(2)
    expect(css).toContain('@import url("https://p.typekit.net/p.css")')
    expect(fetchMock).toHaveBeenCalledWith(TYPEKIT, { mode: 'cors' })
    expect(document.head.querySelector(`link[href="${GOOGLE}"]`)).not.toBeNull()
  })

  it('swap 용 fetch 가 실패하면 일반 <link> 로', async () => {
    fetchMock.mockRejectedValue(new TypeError('CORS'))
    render(<DeferredStylesheets hrefs={[TYPEKIT]} swapFontDisplay={[TYPEKIT]} />)
    await waitFor(() =>
      expect(document.head.querySelector(`link[rel="stylesheet"][href="${TYPEKIT}"]`)).not.toBeNull(),
    )
    expect(document.head.querySelector('style[data-href]')).toBeNull()
  })
})

describe('optimizedImg — 스토리지 이미지', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  const load = async () => (await import('@/templates/shared/optimizedImage')).optimizedImg

  it('로컬 MinIO 주소(공용 템플릿 이미지 · 업로드)도 변환', async () => {
    const optimizedImg = await load()
    const src = 'http://localhost:9000/cms-media/templates/hospital-a/1.0.0/head_slide1.jpg'
    const img = optimizedImg(src, '100vw')
    expect(img.src).toBe(`/_next/image?url=${encodeURIComponent(src)}&w=2048&q=75`)
    expect(img.srcSet).toContain(' 640w')
  })

  it('NEXT_PUBLIC_CDN_HOSTNAME 의 https 주소도 변환', async () => {
    vi.stubEnv('NEXT_PUBLIC_CDN_HOSTNAME', 'cdn.example.com')
    const optimizedImg = await load()
    expect(optimizedImg('https://cdn.example.com/cms-media/templates/a.jpg', '100vw').srcSet).toBeDefined()
    // 같은 호스트라도 http 는 remotePatterns 밖
    expect(optimizedImg('http://cdn.example.com/a.jpg', '100vw')).toEqual({ src: 'http://cdn.example.com/a.jpg' })
  })

  it('그 밖의 외부 주소 · SVG 는 그대로', async () => {
    const optimizedImg = await load()
    const yt = 'https://i.ytimg.com/vi/abc/hqdefault.jpg'
    expect(optimizedImg(yt, '128px')).toEqual({ src: yt })
    const svg = 'http://localhost:9000/cms-media/templates/a/1/logo.svg?v=1'
    expect(optimizedImg(svg, '100vw')).toEqual({ src: svg })
    expect(optimizedImg('/templates/a/1/icon.svg', '100vw')).toEqual({ src: '/templates/a/1/icon.svg' })
  })
})
