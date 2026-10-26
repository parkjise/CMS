'use client'

import { useEffect, useRef, useState } from 'react'
import { getJson } from '@/lib/sectionSettings'
import type { CodeSectionProps } from '../../../shared/contracts'
import { SectionHead } from './SectionHead'
import { titleId } from './ids'

interface HistoryEvent {
  text: string
  highlight?: boolean
}
interface HistoryMonth {
  month: number
  events: HistoryEvent[]
}
interface HistoryYear {
  year: number
  image_url?: string
  months: HistoryMonth[]
}
interface HistoryRange {
  from: number
  to: number
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * 연혁 — 목업 sub/history-timeline.html + history-timeline.js (HISTORY_TIMELINE)
 * - 스크롤 위치에 따라 왼쪽 고정 연도·사진과 활성 구간 탭이 바뀐다
 * 설정 키: eyebrow · title · description (인라인 편집) · ranges [{ from, to }] ·
 *          years [{ year, image_url?, months [{ month, events [{ text, highlight }] }] }] (최근 연도부터)
 */
export function HistoryTimeline(props: CodeSectionProps) {
  const { section } = props
  const id = titleId('history-timeline', section.id)
  const years = getJson<HistoryYear[]>(section.settings, 'years', [])
  const ranges = getJson<HistoryRange[]>(section.settings, 'ranges', [])
  const [current, setCurrent] = useState<HistoryYear | undefined>(years[0])
  const [changing, setChanging] = useState(false)
  const asideRef = useRef<HTMLDivElement>(null)
  const yearRefs = useRef<(HTMLLIElement | null)[]>([])
  const navRef = useRef<HTMLUListElement>(null)

  // 기준선(왼쪽 고정 연도 높이)을 지난 마지막 연도 = 현재 연도 / 페이지 끝이면 마지막 연도
  useEffect(() => {
    if (years.length === 0) return
    let ticking = false
    const pick = () => {
      const aside = asideRef.current
      const stickyTop = aside ? parseFloat(getComputedStyle(aside).top) : NaN
      const line = Number.isNaN(stickyTop) ? window.innerHeight / 3 : stickyTop + 40
      const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2
      let active = 0
      yearRefs.current.forEach((el, i) => {
        if (el && el.getBoundingClientRect().top <= line) active = i
      })
      const last = yearRefs.current.at(-1)
      if (atBottom && last && last.getBoundingClientRect().top < window.innerHeight) {
        active = yearRefs.current.length - 1
      }
      setCurrent((prev) => (prev?.year === years[active]?.year ? prev : years[active]))
    }
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        pick()
        ticking = false
      })
    }
    pick()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [years])

  // 연도 숫자: 살짝 사라졌다 바뀜 / 좁은 화면에선 활성 탭이 보이도록 가로 스크롤
  const [shownYear, setShownYear] = useState(current?.year)
  useEffect(() => {
    if (current?.year === shownYear) return
    setChanging(true)
    const t = setTimeout(() => {
      setShownYear(current?.year)
      setChanging(false)
    }, 150)
    const list = navRef.current
    const active = list?.querySelector<HTMLAnchorElement>('[aria-current="true"]')
    if (list && active) {
      list.scrollTo?.({ left: active.offsetLeft - (list.clientWidth - active.offsetWidth) / 2 })
    }
    return () => clearTimeout(t)
  }, [current, shownYear])

  const inRange = (r: HistoryRange) => current !== undefined && current.year >= r.from && current.year <= r.to
  const firstYearIn = (r: HistoryRange) => years.find((y) => y.year >= r.from && y.year <= r.to)?.year

  return (
    <section className="history-timeline" aria-labelledby={id}>
      <SectionHead {...props} id={id} />

      {ranges.length > 0 && (
        <nav className="history-timeline__nav" aria-label="연도 구간">
          <ul className="history-timeline__nav-list" ref={navRef}>
            {ranges.map((r) => (
              <li key={`${r.from}-${r.to}`}>
                <a
                  className="history-timeline__nav-link"
                  href={`#history-${firstYearIn(r) ?? r.to}`}
                  aria-current={inRange(r) ? 'true' : undefined}
                >
                  {r.to}-{r.from}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="page-container history-timeline__inner">
        {/* 현재 연도 표시 (시각용 — 연도는 목록의 제목으로 스크린리더에 제공) */}
        <div className="history-timeline__aside" aria-hidden="true" ref={asideRef}>
          <p className={`history-timeline__current-year${changing ? ' is-changing' : ''}`}>{shownYear}</p>
          <figure className="history-timeline__current-figure" hidden={!current?.image_url}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 연도별 대표 사진 */}
            {current?.image_url && <img className="history-timeline__current-image" src={current.image_url} alt="" />}
          </figure>
        </div>

        <ol className="history-timeline__years">
          {years.map((y, i) => (
            <li
              className="history-timeline__year"
              id={`history-${y.year}`}
              key={y.year}
              ref={(el) => {
                yearRefs.current[i] = el
              }}
            >
              <h3 className="history-timeline__year-title">{y.year}</h3>
              <ol className="history-timeline__months">
                {y.months.map((m) => (
                  <li className="history-timeline__month" key={m.month}>
                    <time className="history-timeline__month-label" dateTime={`${y.year}-${pad(m.month)}`}>
                      {pad(m.month)}
                      <span className="sr-only">월</span>
                    </time>
                    <ul className="history-timeline__events">
                      {m.events.map((e) => (
                        <li
                          className={`history-timeline__event${e.highlight ? ' history-timeline__event--highlight' : ''}`}
                          key={e.text}
                        >
                          {e.text}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
