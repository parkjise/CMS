'use client'

import { memo, useEffect, useRef, useState } from 'react'
import Swiper from 'swiper'
import { A11y, Autoplay, Navigation, Pagination } from 'swiper/modules'
import { gsap } from 'gsap'
import { getJson } from '@/lib/sectionSettings'
import { optimizedImg } from '../../../shared/optimizedImage'
import type { CodeSectionProps } from '../../../shared/contracts'

interface HeroSlide {
  image_url: string
  title: string
  copy_primary?: string
  copy_secondary?: string
}

// 슬라이드 목록은 Swiper 가 DOM 순서를 바꾸므로(loop) 상태 변경 때 다시 그리지 않게 분리
const HeroTrack = memo(function HeroTrack({ slides }: { slides: HeroSlide[] }) {
  return (
    <div className="hero-slider__track swiper-wrapper">
      {slides.map((slide, i) => (
        <div className="hero-slider__slide swiper-slide" key={`${slide.image_url}-${i}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 목업 마크업(object-fit 배경) 유지 */}
          <img
            className="hero-slider__image"
            {...optimizedImg(slide.image_url, '100vw')}
            alt=""
            // 첫 슬라이드는 첫 화면 주인공 이미지 — 먼저 받고, 나머지는 나중에
            fetchPriority={i === 0 ? 'high' : 'low'}
            loading={i === 0 ? 'eager' : 'lazy'}
          />
        </div>
      ))}
    </div>
  )
})

/**
 * 메인 비주얼 슬라이드 — 목업 sections/hero-slider.html + assets/js/hero-slider.js
 * 설정 키: slides [{ image_url, title, copy_primary, copy_secondary }]
 * 슬라이드 목록은 관리자(AD-02)에서 편집 (목록형 값은 인라인 편집 대상 아님)
 */
export function HeroSlider({ section }: CodeSectionProps) {
  const slides = getJson<HeroSlide[]>(section.settings, 'slides', [])
  const viewportRef = useRef<HTMLDivElement>(null)
  const bulletsRef = useRef<HTMLDivElement>(null)
  const prevRef = useRef<HTMLButtonElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const fillRef = useRef<HTMLSpanElement>(null)
  const contentRefs = useRef<(HTMLDivElement | null)[]>([])
  const swiperRef = useRef<Swiper | null>(null)
  const [index, setIndex] = useState(0)
  const [running, setRunning] = useState(true)

  useEffect(() => {
    if (!viewportRef.current || slides.length === 0) return
    const swiper = new Swiper(viewportRef.current, {
      modules: [A11y, Autoplay, Navigation, Pagination],
      slidesPerView: 1,
      loop: slides.length > 2,
      speed: 600,
      autoplay: { delay: 5000, disableOnInteraction: false, pauseOnMouseEnter: true },
      pagination: { el: bulletsRef.current, clickable: true },
      navigation: { prevEl: prevRef.current, nextEl: nextRef.current },
      on: {
        slideChange: (s) => setIndex(s.realIndex),
        autoplayTimeLeft: (_s, _time, ratio) => {
          if (fillRef.current) fillRef.current.style.transform = `scaleX(${1 - ratio})`
        },
        autoplayStart: () => setRunning(true),
        autoplayStop: () => setRunning(false),
      },
    })
    swiperRef.current = swiper
    return () => {
      swiper.destroy(true, true)
      swiperRef.current = null
    }
  }, [slides.length])

  // 슬라이드가 바뀌면 카피를 아래에서 위로 차례로 등장
  // 첫 화면 카피는 바로 보이게 둔다 — 숨겼다 나타내면 첫 화면 표시(LCP)가 애니메이션만큼 늦어진다 (T-125)
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const panel = contentRefs.current[index]
    if (!panel) return
    const els = panel.querySelectorAll(
      '.hero-slider__title, .hero-slider__copy-line--primary, .hero-slider__copy-line--secondary',
    )
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.fromTo(
      els,
      { y: 30, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: 0.6, stagger: 0.6, ease: 'power2.out', overwrite: true },
    )
  }, [index])

  if (slides.length === 0) return null

  const toggleAutoplay = () => {
    const swiper = swiperRef.current
    if (!swiper) return
    if (swiper.autoplay.running) swiper.autoplay.stop()
    else swiper.autoplay.start()
  }
  const autoplayLabel = running ? '자동 재생 정지' : '자동 재생 시작'

  return (
    <section className="hero-slider" aria-roledescription="carousel" aria-label="메인 비주얼">
      <div className="hero-slider__viewport swiper" ref={viewportRef}>
        <HeroTrack slides={slides} />

        <div className="hero-slider__layout">
          <div className="hero-slider__bullets" ref={bulletsRef} />

          {slides.map((slide, i) => (
            <div
              className="hero-slider__content"
              key={`content-${i}`}
              hidden={i !== index}
              ref={(el) => {
                contentRefs.current[i] = el
              }}
            >
              <h2 className="hero-slider__title">{slide.title}</h2>
              {(slide.copy_primary || slide.copy_secondary) && (
                <p className="hero-slider__copy" lang="en">
                  {slide.copy_primary && (
                    <span className="hero-slider__copy-line hero-slider__copy-line--primary">
                      {slide.copy_primary}
                    </span>
                  )}
                  {slide.copy_secondary && (
                    <span className="hero-slider__copy-line hero-slider__copy-line--secondary">
                      {slide.copy_secondary}
                    </span>
                  )}
                </p>
              )}
            </div>
          ))}

          <div className="hero-slider__controls">
            {/* 진행 표시: 장식용 (슬라이드 위치는 Swiper a11y 가 안내) */}
            <div className="hero-slider__progress" aria-hidden="true">
              <strong className="hero-slider__progress-current">{index + 1}</strong>
              <span className="hero-slider__progress-track">
                <span className="hero-slider__progress-fill" ref={fillRef} />
              </span>
              <span className="hero-slider__progress-total">{slides.length}</span>
            </div>
            <button
              className="hero-slider__button hero-slider__button--autoplay"
              type="button"
              aria-label={autoplayLabel}
              title={autoplayLabel}
              onClick={toggleAutoplay}
            >
              <i className={running ? 'ri-pause-line' : 'ri-play-line'} aria-hidden="true" />
            </button>
            <button
              className="hero-slider__button hero-slider__button--prev"
              type="button"
              aria-label="이전 슬라이드"
              ref={prevRef}
            >
              <i className="ri-arrow-left-s-line" aria-hidden="true" />
            </button>
            <button
              className="hero-slider__button hero-slider__button--next"
              type="button"
              aria-label="다음 슬라이드"
              ref={nextRef}
            >
              <i className="ri-arrow-right-s-line" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
