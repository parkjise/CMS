'use client'

import { useEffect } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// 목업 assets/js/scroll-reveal.js 대상 (메인 + 서브: 사업 소개)
const SELECTORS = [
  '.brand-intro__title',
  '.brand-intro__desc',
  '.brand-intro__gallery',
  '.brand-intro__signature-title',
  '.brand-intro__signature-desc',
  '.brand-intro__feature',
  '.service-cards .section-head > *',
  '.service-cards__item',
  '.video-playlist .section-head > *',
  '.video-playlist__featured',
  '.video-playlist__item',
  '.notice__head > *',
  '.notice__item',
  '.page-intro .section-head > *',
  '.story-text__title',
  '.story-text__desc',
  '.split-story__media',
  '.milestone-split__media',
  '.milestone-split__item',
  '.criteria-cards__item',
  '.value-circles__item',
  '.value-circles__more',
]

/** 스크롤해서 보이면 아래에서 위로 나타나는 효과 (동작 줄이기 설정이면 생략) */
export function ScrollReveal({ templateKey }: { templateKey: string }) {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // 인라인 편집 중에는 글자가 사라지지 않게 효과를 끈다
    if (document.body.classList.contains('edit-mode')) return
    gsap.registerPlugin(ScrollTrigger)
    const root = document.querySelector(`[data-template="${templateKey}"]`)
    if (!root) return
    const ctx = gsap.context(() => {
      root.querySelectorAll(SELECTORS.join(', ')).forEach((el) => {
        gsap.fromTo(
          el,
          { y: 36, autoAlpha: 0 },
          {
            y: 0,
            autoAlpha: 1,
            duration: 1,
            ease: 'power2.out',
            scrollTrigger: { trigger: el, start: 'top 88%', once: true },
          },
        )
      })
    }, root)
    return () => ctx.revert()
  }, [templateKey])

  return null
}
