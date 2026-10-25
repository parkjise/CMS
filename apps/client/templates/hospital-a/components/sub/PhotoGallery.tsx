'use client'

import { memo, useEffect, useRef } from 'react'
import Swiper from 'swiper'
import { A11y, Autoplay, Keyboard, Navigation, Pagination, Thumbs } from 'swiper/modules'
import { getJson } from '@/lib/sectionSettings'
import type { CodeSectionProps } from '../../../shared/contracts'
import { SectionHead } from './SectionHead'
import { titleId } from './ids'

interface Photo {
  image_url: string
  alt: string
}

const Slides = memo(function Slides({ photos, thumbs }: { photos: Photo[]; thumbs?: boolean }) {
  return (
    <div className="swiper-wrapper">
      {photos.map((p, i) =>
        thumbs ? (
          <div className="photo-gallery__thumb swiper-slide" key={`${p.image_url}-${i}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 썸네일 */}
            <img src={p.image_url} alt="" />
          </div>
        ) : (
          <div className="photo-gallery__slide swiper-slide" key={`${p.image_url}-${i}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 목업 슬라이드 사진 */}
            <img className="photo-gallery__image" src={p.image_url} alt={p.alt} loading="lazy" />
          </div>
        ),
      )}
    </div>
  )
})

/**
 * 큰 사진 슬라이드 + 썸네일 + 진행 바 — 목업 sub/photo-gallery.html + photo-gallery.js (layout=photo-gallery)
 * 설정 키: eyebrow · title (인라인 편집) · photos [{ image_url, alt }]
 */
export function PhotoGallery(props: CodeSectionProps) {
  const { section } = props
  const id = titleId('photo-gallery', section.id)
  const photos = getJson<Photo[]>(section.settings, 'photos', [])
  const mainRef = useRef<HTMLDivElement>(null)
  const thumbsRef = useRef<HTMLDivElement>(null)
  const prevRef = useRef<HTMLButtonElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mainRef.current || !thumbsRef.current || photos.length === 0) return
    const thumbs = new Swiper(thumbsRef.current, {
      modules: [A11y],
      slidesPerView: 'auto',
      spaceBetween: 10,
      watchSlidesProgress: true,
      a11y: { slideLabelMessage: '{{index}}번 사진 보기' },
    })
    const main = new Swiper(mainRef.current, {
      modules: [A11y, Autoplay, Keyboard, Navigation, Pagination, Thumbs],
      speed: 600,
      autoplay: { delay: 4500, disableOnInteraction: false, pauseOnMouseEnter: true },
      keyboard: { enabled: true, onlyInViewport: true },
      navigation: { prevEl: prevRef.current, nextEl: nextRef.current },
      pagination: { el: progressRef.current, type: 'progressbar' },
      thumbs: { swiper: thumbs },
      a11y: { prevSlideMessage: '이전 사진', nextSlideMessage: '다음 사진' },
    })
    return () => {
      main.destroy(true, true)
      thumbs.destroy(true, true)
    }
  }, [photos.length])

  return (
    <section className="photo-gallery" aria-labelledby={id}>
      <div className="page-container">
        <SectionHead {...props} id={id} sub />
        <div className="photo-gallery__frame">
          <button className="photo-gallery__arrow photo-gallery__arrow--prev" type="button" aria-label="이전 사진" ref={prevRef}>
            <i className="ri-arrow-left-s-line" aria-hidden="true" />
          </button>
          <div className="photo-gallery__main swiper" role="region" aria-label="공간 사진 슬라이드" ref={mainRef}>
            <Slides photos={photos} />
          </div>
          <button className="photo-gallery__arrow photo-gallery__arrow--next" type="button" aria-label="다음 사진" ref={nextRef}>
            <i className="ri-arrow-right-s-line" aria-hidden="true" />
          </button>
        </div>
        <div className="photo-gallery__thumbs swiper" ref={thumbsRef}>
          <Slides photos={photos} thumbs />
        </div>
        <div className="photo-gallery__progress swiper-pagination" aria-hidden="true" ref={progressRef} />
      </div>
    </section>
  )
}
