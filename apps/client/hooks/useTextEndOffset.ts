'use client'

import { useEffect, type RefObject } from 'react'

/** AI 추천 버튼 폭 + 글자와의 간격 */
const BUTTON_SPACE = 72

interface Box {
  left: number
  right: number
}

/**
 * 글자 옆 버튼 위치 — 글자를 가리지 않게 글자 바로 오른쪽에, 자리가 없으면 줄 끝에서 글자 위로.
 * right: 감싸개 오른쪽 끝에서의 거리(px), above: 글자 위로 올릴지
 */
export const textEndOffset = (wrap: Box, text: Box): { right: number; above: boolean } => {
  if (text.right <= text.left) return { right: 0, above: false }
  const room = wrap.right - text.right
  return { right: Math.max(0, room - BUTTON_SPACE), above: room < BUTTON_SPACE }
}

/**
 * 제목 · 문단 감싸개는 줄 전체를 차지한다 (T-125-G). 글자 옆에 띄우는 AI 추천 버튼 · 글자 수가
 * 줄 끝으로 밀리지 않게, 위치를 감싸개의 CSS 변수 --edit-text-end · --edit-text-top 으로 알려 준다 (T-125-H).
 * 글자를 고치거나 폭이 바뀌거나 글꼴이 늦게 적용되면 다시 잰다.
 */
export const useTextEndOffset = (
  wrapRef: RefObject<HTMLElement | null>,
  textRef: RefObject<HTMLElement | null>,
  active: boolean,
) => {
  useEffect(() => {
    const wrap = wrapRef.current
    const text = textRef.current
    if (!active || !wrap || !text) return

    const measure = () => {
      const range = document.createRange()
      range.selectNodeContents(text)
      const { right, above } = textEndOffset(
        wrap.getBoundingClientRect(),
        range.getBoundingClientRect(),
      )
      wrap.style.setProperty('--edit-text-end', `${right}px`)
      wrap.style.setProperty('--edit-text-top', above ? '-1.75rem' : '-0.5rem')
    }
    measure()

    const mutations = new MutationObserver(measure)
    mutations.observe(text, { characterData: true, childList: true, subtree: true })
    const resize = new ResizeObserver(measure)
    resize.observe(wrap)
    // 웹폰트 CSS 는 하이드레이션 뒤에 붙는다 (T-125) — 글꼴이 바뀌면 폭이 달라진다
    document.fonts?.addEventListener('loadingdone', measure)

    return () => {
      mutations.disconnect()
      resize.disconnect()
      document.fonts?.removeEventListener('loadingdone', measure)
    }
  }, [wrapRef, textRef, active])
}
