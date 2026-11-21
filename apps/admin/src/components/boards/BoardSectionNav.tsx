import { useEffect } from 'react'
import { Navigate, useLocation, useParams } from 'react-router'

const USER_SCROLL_EVENTS = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const
const SETTLE_MS = 2000

export interface BoardSectionLink {
  id: string
  label: string
}

/** 합친 화면의 구역 바로가기 (T-212) — 주소의 #구역 으로 들어오면 그 구역으로 */
export function BoardSectionNav({ sections }: { sections: BoardSectionLink[] }) {
  const { hash } = useLocation()

  useEffect(() => {
    const id = hash.replace('#', '')
    if (!id) return
    const scroll = () => document.getElementById(id)?.scrollIntoView()
    // 위 구역 내용이 늦게 불러와지면 이 구역이 밀려난다 — 화면이 자리 잡을 때까지 다시 맞춘다
    const timer = window.setTimeout(scroll, 0)
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => scroll())
    // 관리자 화면은 본문(main)이 스크롤된다 — 구역들을 담은 상자의 높이 변화를 본다
    observer?.observe(document.getElementById(id)?.parentElement ?? document.body)
    const stop = () => {
      observer?.disconnect()
      USER_SCROLL_EVENTS.forEach((type) => window.removeEventListener(type, stop))
    }
    // 사용자가 직접 움직이면 그만 맞춘다
    USER_SCROLL_EVENTS.forEach((type) => window.addEventListener(type, stop, { passive: true }))
    const settle = window.setTimeout(stop, SETTLE_MS)
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(settle)
      stop()
    }
  }, [hash])

  if (sections.length < 2) return null
  return (
    <nav aria-label="구역 바로가기" className="flex flex-wrap gap-2">
      {sections.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
            hash === `#${section.id}`
              ? 'border-blue-600 bg-blue-50 text-blue-700'
              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
          }`}
        >
          {section.label}
        </a>
      ))}
    </nav>
  )
}

/** 구역 하나 — 제목과 그 구역의 원래 화면 내용 (저장은 구역마다 따로) */
export function BoardSectionBlock({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 space-y-4">
      <h2 id={`${id}-title`} className="text-base font-semibold text-slate-800">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** 예전 탭 주소 → 합친 화면의 그 구역 (T-212) — 북마크 · 변경 기록 링크가 깨지지 않게 */
export function BoardSectionRedirect({ page, section }: { page: string; section: string }) {
  const { boardId = '' } = useParams()
  return <Navigate to={`/admin/boards/${boardId}/${page}#${section}`} replace />
}
