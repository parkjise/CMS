import { ImageOff } from 'lucide-react'

interface SocialPreviewProps {
  title: string
  description: string
  url: string
  imageUrl: string
}

export function SocialPreview({
  title,
  description,
  url,
  imageUrl,
}: SocialPreviewProps) {
  const host = (() => {
    try {
      return new URL(url || 'https://example.com').host
    } catch {
      return 'example.com'
    }
  })()

  const displayTitle = title.trim() || '소셜에 공유될 페이지 제목'
  const displayDesc = description.trim() || '소셜 공유 시 노출될 짧은 설명입니다.'

  return (
    <div className="space-y-4">
      {/* Facebook 스타일 카드 */}
      <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
        <div className="flex aspect-[1.91/1] items-center justify-center bg-slate-100">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="OG 이미지"
              className="h-full w-full object-cover"
              onError={(e) => {
                ;(e.currentTarget as HTMLImageElement).style.display = 'none'
              }}
            />
          ) : (
            <div className="flex flex-col items-center text-slate-300">
              <ImageOff className="mb-1 h-8 w-8" />
              <span className="text-xs">1200×630 권장</span>
            </div>
          )}
        </div>
        <div className="space-y-1 border-t border-slate-200 bg-slate-50 p-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">
            {host}
          </p>
          <h4 className="line-clamp-2 text-sm font-semibold text-slate-900">
            {displayTitle}
          </h4>
          <p className="line-clamp-2 text-xs text-slate-600">{displayDesc}</p>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Facebook · 카카오톡 · LinkedIn 등에서 동일한 형태로 노출됩니다.
      </p>
    </div>
  )
}
