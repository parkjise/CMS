'use client'

import { memo, useEffect, useRef } from 'react'
import Swiper from 'swiper'
import { A11y, Autoplay } from 'swiper/modules'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { getJson } from '@/lib/sectionSettings'
import type { CodeSectionProps } from '../../../shared/contracts'
import { TemplateText } from '../../../shared/TemplateText'
import { optimizedImg } from '../../../shared/optimizedImage'

interface GalleryImage {
  image_url: string
  alt: string
}
interface Feature {
  name: string
  name_en?: string
  icon_url?: string
  link_url?: string
}

// 보이는 영역보다 카드가 많아야 loop 가 자연스러워 목록을 4번 반복해 그린다 (목업 JS 의 cloneNode 대체)
const REPEAT = 4

const Gallery = memo(function Gallery({ images }: { images: GalleryImage[] }) {
  const viewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!viewportRef.current || images.length === 0) return
    const updateCards = (swiper: Swiper) => {
      swiper.slides.forEach((slide) => {
        const progress = Math.max(-1, Math.min(1, (slide as HTMLElement & { progress?: number }).progress ?? 0))
        const distance = Math.abs(progress)
        const card = slide.querySelector<HTMLElement>('.brand-intro__gallery-card')
        if (!card) return
        card.style.transform = `translateY(${distance * 158}px) scale(${1 - distance * 0.25}) rotate(${-progress * 44}deg)`
        card.style.opacity = String(1 - distance * 0.7)
      })
    }
    const swiper = new Swiper(viewportRef.current, {
      modules: [A11y, Autoplay],
      initialSlide: 1,
      slidesPerView: 1,
      centeredSlides: true,
      spaceBetween: '25%',
      watchSlidesProgress: true,
      loop: true,
      loopAdditionalSlides: 3,
      speed: 700,
      grabCursor: true,
      autoplay: { delay: 3000, disableOnInteraction: false, pauseOnMouseEnter: true },
      a11y: { prevSlideMessage: '이전 이미지', nextSlideMessage: '다음 이미지', slideLabelMessage: '' },
      on: {
        init: updateCards,
        setTranslate: updateCards,
        setTransition: (s, duration) => {
          s.slides.forEach((slide) => {
            const card = slide.querySelector<HTMLElement>('.brand-intro__gallery-card')
            if (card) card.style.transitionDuration = `${duration}ms`
          })
        },
      },
    })
    return () => swiper.destroy(true, true)
  }, [images.length])

  const repeated = Array.from({ length: REPEAT }, () => images).flat()

  return (
    <div className="brand-intro__gallery">
      <div
        className="brand-intro__gallery-viewport swiper"
        role="region"
        aria-label="브랜드 이미지 갤러리"
        ref={viewportRef}
      >
        <div className="brand-intro__gallery-track swiper-wrapper">
          {repeated.map((image, i) => (
            <div
              className="brand-intro__gallery-slide swiper-slide"
              key={`${image.image_url}-${i}`}
              aria-label={`${images.length}개 중 ${(i % images.length) + 1}번째 이미지`}
              aria-hidden={i >= images.length ? true : undefined}
            >
              <figure className="brand-intro__gallery-card">
                {/* eslint-disable-next-line @next/next/no-img-element -- 목업 카드 회전 효과 유지 */}
                <img
                  className="brand-intro__gallery-image"
                  {...optimizedImg(image.image_url, '(min-width: 768px) 40vw, 80vw', 1200)}
                  alt={i < images.length ? image.alt : ''}
                  loading="lazy"
                />
              </figure>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})

/**
 * 브랜드 소개 + 이미지 갤러리 + 대표 서비스 3종 — 목업 sections/brand-intro.html + brand-intro.js
 * 설정 키: title · description · signature_title · signature_desc (인라인 편집)
 *          gallery [{ image_url, alt }] · features [{ name, name_en, icon_url, link_url }]
 */
export function BrandIntro({ section, editable }: CodeSectionProps) {
  const sectionRef = useRef<HTMLElement>(null)
  const gallery = getJson<GalleryImage[]>(section.settings, 'gallery', [])
  const features = getJson<Feature[]>(section.settings, 'features', [])

  // 스크롤로 다가오면 위 모서리가 둥글어짐
  useEffect(() => {
    const el = sectionRef.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.registerPlugin(ScrollTrigger)
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { borderTopLeftRadius: 0, borderTopRightRadius: 0 },
        {
          borderTopLeftRadius: 120,
          borderTopRightRadius: 120,
          duration: 0.8,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 90%',
            end: 'top 40%',
            toggleActions: 'play reverse play reverse',
          },
        },
      )
    })
    return () => ctx.revert()
  }, [])

  return (
    <section className="brand-intro" id="about" aria-labelledby="brand-intro-title" ref={sectionRef}>
      <div className="brand-intro__glow" aria-hidden="true" />
      <div className="brand-intro__glow brand-intro__glow--bottom-left" aria-hidden="true" />

      <div className="page-container">
        <header className="brand-intro__head">
          <TemplateText
            section={section}
            editable={editable}
            field="title"
            as="h2"
            id="brand-intro-title"
            className="brand-intro__title"
            multiline
            maxLength={60}
            lang="en"
          />
          <TemplateText
            section={section}
            editable={editable}
            field="description"
            as="p"
            className="brand-intro__desc"
            maxLength={200}
          />
        </header>
      </div>

      {gallery.length > 0 && <Gallery images={gallery} />}

      <div className="brand-intro__signature">
        <TemplateText
          section={section}
          editable={editable}
          field="signature_title"
          as="h3"
          className="brand-intro__signature-title"
          multiline
          maxLength={40}
          lang="en"
        />
        <TemplateText
          section={section}
          editable={editable}
          field="signature_desc"
          as="p"
          className="brand-intro__signature-desc"
          maxLength={80}
        />

        {features.length > 0 && (
          <div className="page-container">
            <ul className="brand-intro__features">
              {features.map((f) => (
                <li className="brand-intro__feature" key={f.name}>
                  <a className="brand-intro__feature-link" href={f.link_url || '#'}>
                    <span className="brand-intro__feature-text">
                      <strong className="brand-intro__feature-name">{f.name}</strong>
                      {f.name_en && (
                        <span className="brand-intro__feature-en" lang="en">
                          {f.name_en}
                        </span>
                      )}
                    </span>
                    {f.icon_url && (
                      <span className="brand-intro__feature-icon" aria-hidden="true">
                        {/* eslint-disable-next-line @next/next/no-img-element -- 장식용 SVG 아이콘 */}
                        <img className="brand-intro__feature-icon-image" src={f.icon_url} alt="" />
                      </span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
