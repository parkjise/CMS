import Image from 'next/image'
import type { GalleryItem } from './types'

interface Props {
  items: GalleryItem[]
}

/** 방문자 화면 갤러리 — 서버 렌더링 · 편집 모드 미리보기(T-065-B) 공통 */
export function GalleryGrid({ items }: Props) {
  if (items.length === 0) {
    return (
      <p className="mt-6 text-sm text-[color:var(--color-text-muted)]">등록된 이미지가 없습니다.</p>
    )
  }
  return (
    <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
      {items.map((item, idx) => (
        <figure
          key={`${item.image_url}-${idx}`}
          className="overflow-hidden rounded-[var(--border-radius-card)]"
        >
          <div className="relative aspect-square w-full overflow-hidden">
            <Image
              src={item.image_url}
              alt={item.caption || `gallery-${idx}`}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover transition hover:scale-105"
            />
          </div>
          {item.caption && (
            <figcaption className="mt-2 text-xs text-[color:var(--color-text-muted)]">
              {item.caption}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  )
}
