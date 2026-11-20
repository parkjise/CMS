import { TriangleAlert } from 'lucide-react'

interface GoogleSnippetPreviewProps {
  title: string
  description: string
  url: string
  /** 검색 노출을 끈 상태 (robots noindex) */
  hidden?: boolean
  /** 검색 결과에서 보통 잘리지 않는 길이 */
  titleMax?: number
  descriptionMax?: number
}

const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text)

/** 검색 결과 미리보기 (T-225 보완) — 빈 칸이면 홈페이지가 실제로 내보내는 값 · 잘림을 함께 알려 준다 */
export function GoogleSnippetPreview({
  title,
  description,
  url,
  hidden = false,
  titleMax = 60,
  descriptionMax = 160,
}: GoogleSnippetPreviewProps) {
  const trimmedTitle = title.trim()
  const trimmedDesc = description.trim()
  const notes = [
    hidden && '지금은 검색에 나오지 않게 설정돼 있어요. [사이트맵] 탭의 검색 노출을 확인하세요.',
    !trimmedTitle && '페이지 제목이 비어 있어 사업체 이름이 제목으로 나가요.',
    trimmedTitle.length > titleMax && `제목이 ${titleMax}자를 넘어 검색 결과에서 뒷부분이 잘릴 수 있어요.`,
    !trimmedDesc && '설명이 비어 있으면 검색엔진이 본문에서 문장을 골라 보여 줘요.',
    trimmedDesc.length > descriptionMax &&
      `설명이 ${descriptionMax}자를 넘어 뒷부분이 잘릴 수 있어요.`,
  ].filter((note): note is string => Boolean(note))

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
        검색 결과 미리보기
      </p>
      <div className={`space-y-1.5 font-sans ${hidden ? 'opacity-50' : ''}`}>
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <span
            aria-hidden="true"
            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-[10px] font-semibold text-blue-700"
          >
            🌐
          </span>
          <span className="truncate">{url}</span>
        </div>
        <div className="break-words text-xl text-blue-700">
          {trimmedTitle ? cut(trimmedTitle, titleMax) : '(사업체 이름)'}
        </div>
        <p className="break-words text-sm leading-relaxed text-slate-600">
          {trimmedDesc ? cut(trimmedDesc, descriptionMax) : '(본문에서 고른 문장)'}
        </p>
      </div>
      {notes.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3">
          {notes.map((note) => (
            <li key={note} className="flex items-start gap-1.5 text-xs text-amber-700">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {note}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
        실제 검색 결과는 검색엔진이 정해요. 네이버 · 구글 모두 제목과 설명이 길면 줄여서 보여 줍니다.
      </p>
    </div>
  )
}
