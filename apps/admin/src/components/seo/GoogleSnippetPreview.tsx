interface GoogleSnippetPreviewProps {
  title: string
  description: string
  url: string
}

export function GoogleSnippetPreview({
  title,
  description,
  url,
}: GoogleSnippetPreviewProps) {
  const displayTitle = title.trim() || '검색 결과 제목이 여기에 표시됩니다'
  const displayDesc =
    description.trim() ||
    '메타 설명을 입력하면 Google 검색결과에 함께 노출됩니다. 보통 150~160자 사이로 작성하는 것이 좋습니다.'
  const displayUrl = url || 'https://example.com'

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
        Google 검색 결과 미리보기
      </p>
      <div className="space-y-1.5 font-sans">
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <span
            aria-hidden="true"
            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-[10px] font-semibold text-blue-700"
          >
            🌐
          </span>
          <span className="truncate">{displayUrl}</span>
        </div>
        <div className="cursor-pointer text-xl text-blue-700 hover:underline">
          {displayTitle}
        </div>
        <p className="text-sm leading-relaxed text-slate-600">{displayDesc}</p>
      </div>
    </div>
  )
}
