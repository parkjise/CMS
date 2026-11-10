import { useEffect, useId, useState, type ReactNode } from 'react'
import { CircleHelp } from 'lucide-react'
import { useLocation } from 'react-router'

interface BoardPageTitleProps {
  title: string
  description: string
  /** 제목 오른쪽 버튼 */
  actions?: ReactNode
}

/** 들어온 뒤 10초 동안 설명을 보여 주고, 그다음엔 마우스 · 키보드 포커스로 다시 연다 */
const HELP_INTRO_MS = 10_000

function TitleHelp({ title, description }: { title: string; description: string }) {
  const id = useId()
  const [intro, setIntro] = useState(true)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const open = !dismissed && (intro || hovered || focused)

  useEffect(() => {
    const timer = window.setTimeout(() => setIntro(false), HELP_INTRO_MS)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    // 좁은 화면에서는 말풍선을 제목 줄 기준으로 펼쳐 화면 밖으로 나가지 않게 한다
    <div
      className="flex items-center sm:relative"
      onMouseEnter={() => {
        setHovered(true)
        setDismissed(false)
      }}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-label={`${title} 도움말`}
        aria-describedby={open ? id : undefined}
        className="grid h-7 w-7 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        onFocus={() => {
          setFocused(true)
          setDismissed(false)
        }}
        onBlur={() => setFocused(false)}
        onClick={() => {
          setIntro(false)
          setDismissed((value) => !value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setIntro(false)
            setDismissed(true)
          }
        }}
      >
        <CircleHelp className="h-[17px] w-[17px]" aria-hidden />
      </button>
      {open && (
        <div
          id={id}
          role="tooltip"
          className="absolute left-0 top-full z-20 mt-2 w-72 max-w-[calc(100vw-3rem)] rounded-lg bg-slate-800 px-3.5 py-2.5 text-xs leading-relaxed text-white shadow-lg sm:left-full sm:top-1/2 sm:ml-2 sm:mt-0 sm:-translate-y-1/2"
        >
          {description}
        </div>
      )}
    </div>
  )
}

/** 게시판 관리 화면 제목 — 설명은 제목 옆 물음표 도움말로 (T-187) */
export function BoardPageTitle({ title, description, actions }: BoardPageTitleProps) {
  // 화면을 옮길 때마다 처음 10초 안내를 다시 보여 준다
  const { key } = useLocation()
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="relative flex min-w-0 items-center gap-2">
        <h1 className="truncate text-[26px] font-bold tracking-tight text-slate-900">{title}</h1>
        <TitleHelp key={key} title={title} description={description} />
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
