'use client'

import { useEffect, useRef } from 'react'
import Swiper from 'swiper'
import { A11y, Pagination } from 'swiper/modules'
import { getJson } from '@/lib/sectionSettings'
import type { CodeSectionProps } from '../../../shared/contracts'
import { TemplateText } from '../../../shared/TemplateText'

interface ServiceCard {
  image_url: string
  eyebrow?: string
  title: string
  description?: string
  link_url?: string
}

/**
 * 서비스 카드 목록 — 목업 sections/service-cards.html + service-cards.js
 * 1024px 이상: 5단 그리드 / 미만: 슬라이드 (넓어지면 Swiper 해제)
 * 설정 키: eyebrow · title · description (인라인 편집) · cards [{ image_url, eyebrow, title, description, link_url }]
 */
export function ServiceCards({ section, editable }: CodeSectionProps) {
  const cards = getJson<ServiceCard[]>(section.settings, 'cards', [])
  const viewportRef = useRef<HTMLDivElement>(null)
  const paginationRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || cards.length === 0) return
    const mq = window.matchMedia('(max-width: 1023.98px)')
    let swiper: Swiper | null = null

    const sync = () => {
      if (mq.matches && !swiper) {
        swiper = new Swiper(viewport, {
          modules: [A11y, Pagination],
          wrapperClass: 'service-cards__list',
          slideClass: 'service-cards__item',
          slidesPerView: 1.2,
          spaceBetween: 16,
          breakpoints: { 600: { slidesPerView: 2.3, spaceBetween: 20 } },
          pagination: { el: paginationRef.current, clickable: true },
          a11y: {
            slideRole: 'listitem',
            slideLabelMessage: '{{index}} / {{slidesLength}}',
            paginationBulletMessage: '{{index}}번째 카드로 이동',
          },
        })
      } else if (!mq.matches && swiper) {
        swiper.destroy(true, true)
        swiper = null
      }
    }
    sync()
    mq.addEventListener('change', sync)
    return () => {
      mq.removeEventListener('change', sync)
      swiper?.destroy(true, true)
    }
  }, [cards.length])

  return (
    <section className="service-cards" id="services" aria-labelledby="service-cards-title">
      <div className="page-container">
        <header className="section-head">
          <TemplateText section={section} editable={editable} field="eyebrow" as="p" className="section-head__eyebrow" lang="en" maxLength={40} />
          <TemplateText
            section={section}
            editable={editable}
            field="title"
            as="h2"
            id="service-cards-title"
            className="section-head__title"
            multiline
            maxLength={80}
          />
          <TemplateText section={section} editable={editable} field="description" as="p" className="section-head__desc" maxLength={200} />
        </header>

        <div className="service-cards__viewport" ref={viewportRef}>
          <ul className="service-cards__list card-grid card-grid--cols-5">
            {cards.map((card, i) => (
              <li className="service-cards__item" key={`${card.title}-${i}`}>
                <a className="service-cards__link" href={card.link_url || '#'}>
                  <div className="service-cards__media">
                    {/* eslint-disable-next-line @next/next/no-img-element -- 목업 카드 hover 확대 효과 유지 */}
                    <img className="service-cards__image" src={card.image_url} alt="" />
                  </div>
                  <div className="service-cards__body">
                    {card.eyebrow && (
                      <span className="service-cards__eyebrow" lang="en">
                        {card.eyebrow}
                      </span>
                    )}
                    <h3 className="service-cards__title">{card.title}</h3>
                    {card.description && <span className="service-cards__desc">{card.description}</span>}
                  </div>
                </a>
              </li>
            ))}
          </ul>
          <div className="service-cards__pagination" ref={paginationRef} />
        </div>
      </div>
    </section>
  )
}
