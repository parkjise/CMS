'use client'

import { useEffect } from 'react'

interface DeferredStylesheetsProps {
  hrefs: string[]
  /**
   * font-display 를 swap 으로 바꿔 적용할 주소 (hrefs 중 일부, CORS 허용 필요).
   * font-display:auto(=block) 인 웹폰트는 글꼴이 올 때까지 글자를 숨겨 첫 화면 표시(LCP)가 늦어진다.
   * 글꼴 · 추적용 @import 는 그대로 두고 표시 시점만 바꾼다. 실패하면 일반 <link> 로 붙인다
   */
  swapFontDisplay?: string[]
}

const FONT_DISPLAY_BLOCKING = /font-display\s*:\s*(auto|block)/g

const appendLink = (href: string) => {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

const appendSwapped = async (href: string) => {
  try {
    const res = await fetch(href, { mode: 'cors' })
    if (!res.ok) throw new Error(String(res.status))
    const css = (await res.text()).replace(FONT_DISPLAY_BLOCKING, 'font-display:swap')
    const style = document.createElement('style')
    style.dataset.href = href
    style.textContent = css
    document.head.appendChild(style)
  } catch {
    appendLink(href)
  }
}

const isAttached = (href: string) =>
  Boolean(
    document.querySelector(
      `link[rel="stylesheet"][href="${CSS.escape(href)}"], style[data-href="${CSS.escape(href)}"]`,
    ),
  )

/**
 * 첫 화면을 막지 않는 외부 스타일시트 (웹폰트 CSS 등, T-125 모바일 성능).
 * 화면을 그린 뒤(하이드레이션 후) 받아서 적용한다. 글꼴이 오기 전에는 대체 글꼴로 먼저 보인다.
 * preload 는 하지 않는다 — 첫 화면 전에 받는 양이 늘어 첫 표시(FCP · LCP)가 늦어진다 (측정 결과).
 * 같은 주소는 한 번만 붙인다.
 */
const DeferredStylesheets = ({ hrefs, swapFontDisplay = [] }: DeferredStylesheetsProps) => {
  useEffect(() => {
    for (const href of hrefs) {
      if (isAttached(href)) continue
      if (swapFontDisplay.includes(href)) void appendSwapped(href)
      else appendLink(href)
    }
  }, [hrefs, swapFontDisplay])

  return null
}

export default DeferredStylesheets
