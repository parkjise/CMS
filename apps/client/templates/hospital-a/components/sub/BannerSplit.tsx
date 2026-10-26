import { getString } from '@/lib/sectionSettings'
import type { CodeSectionProps } from '../../../shared/contracts'
import { StoryText } from './StoryText'
import { titleId } from './ids'
import { optimizedImg } from '../../../shared/optimizedImage'

/**
 * 글 | 오른쪽 끝까지 꽉 찬 사진 — 목업 sub/banner-split.html (layout=banner-split)
 * 설정 키: en_title · sub_title · paragraphs · image_url · image_alt
 */
export function BannerSplit(props: CodeSectionProps) {
  const { section } = props
  const id = titleId('banner-split', section.id)
  return (
    <section className="banner-split" aria-labelledby={id}>
      <div className="page-container banner-split__inner">
        <StoryText {...props} id={id} className="banner-split__text" />
      </div>
      <figure className="banner-split__media">
        {/* eslint-disable-next-line @next/next/no-img-element -- 목업 사진 비율 유지 */}
        <img className="banner-split__image" {...optimizedImg(getString(section.settings, 'image_url'), '(min-width: 1024px) 50vw, 100vw', 1200)} alt={getString(section.settings, 'image_alt')} loading="lazy" />
      </figure>
    </section>
  )
}
