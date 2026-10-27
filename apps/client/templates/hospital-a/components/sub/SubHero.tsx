'use client'

import { useRef } from 'react'
import { getBoolean, getString } from '@/lib/sectionSettings'
import type { CodeSectionProps } from '../../../shared/contracts'
import { TemplateText } from '../../../shared/TemplateText'
import { optimizedImg } from '../../../shared/optimizedImage'

interface Props extends CodeSectionProps {
  homeHref: string
  scrollIconUrl: string
}

/**
 * 서브 상단 비주얼 + 제목 + 브레드크럼 — 목업 sub/sub-hero.html + sub-hero.js
 * 설정 키: eyebrow · title · category (인라인 편집) · image_url · plain(이미지 없는 형 — 목업 sub-hero-plain)
 */
export function SubHero({ section, editable, homeHref, scrollIconUrl }: Props) {
  const ref = useRef<HTMLElement>(null)
  const image = getString(section.settings, 'image_url')
  const title = getString(section.settings, 'title')
  const plain = getBoolean(section.settings, 'plain')

  // 아래로: 다음 영역 시작점으로 이동 + 첫 링크·버튼에 포커스
  const scrollDown = () => {
    const target = ref.current?.nextElementSibling as HTMLElement | null
    if (!target) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: window.scrollY + target.getBoundingClientRect().top, behavior: reduce ? 'auto' : 'smooth' })
    target.querySelector<HTMLElement>('a, button, [tabindex="0"]')?.focus({ preventScroll: true })
  }

  return (
    <section
      className={`sub-hero${plain ? ' sub-hero--plain' : ''}`}
      aria-labelledby="sub-hero-title"
      ref={ref}
    >
      {/* 서브 페이지 첫 화면 주인공 이미지(LCP) — 먼저 받는다 (T-125) */}
      {image && !plain && (
        // eslint-disable-next-line @next/next/no-img-element -- 목업 배경 비주얼(object-fit) 유지
        <img
          className="sub-hero__image"
          {...optimizedImg(image, '100vw', 2048)}
          alt=""
          fetchPriority="high"
          loading="eager"
        />
      )}
      <div className="page-container sub-hero__content">
        <TemplateText section={section} editable={editable} field="eyebrow" as="p" className="sub-hero__eyebrow" lang="en" maxLength={40} />
        <TemplateText section={section} editable={editable} field="title" as="h2" id="sub-hero-title" className="sub-hero__title" maxLength={40} />

        <nav className="breadcrumb" aria-label="현재 위치">
          <ol className="breadcrumb__list">
            <li className="breadcrumb__item">
              <a className="breadcrumb__link" href={homeHref}>
                <i className="ri-home-5-line" aria-hidden="true" />
                <span className="sr-only">홈</span>
              </a>
            </li>
            <li className="breadcrumb__item">
              <span lang="en">{getString(section.settings, 'category')}</span>
            </li>
            <li className="breadcrumb__item">
              <span aria-current="page">{title}</span>
            </li>
          </ol>
        </nav>
      </div>
      {!plain && (
        <button className="sub-hero__scroll" type="button" aria-label="아래로 스크롤" onClick={scrollDown}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 장식 아이콘 */}
          <img className="sub-hero__scroll-icon" src={scrollIconUrl} width={20} height={38} alt="" />
        </button>
      )}
    </section>
  )
}
