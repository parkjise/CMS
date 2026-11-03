import { getString } from '@/lib/sectionSettings'
import type { CodeSectionProps } from '../../../shared/contracts'
import { StoryText } from './StoryText'
import { titleId } from './ids'
import { TemplateImage } from '../../../shared/TemplateImage'

/**
 * 글 | 오른쪽 끝까지 꽉 찬 사진 — 목업 sub/banner-split.html (layout=banner-split)
 * 설정 키: en_title · sub_title · paragraphs · image_url · image_alt
 */
export function BannerSplit(props: CodeSectionProps) {
  const { section, editable } = props
  const id = titleId('banner-split', section.id)
  return (
    <section className="banner-split" aria-labelledby={id}>
      <div className="page-container banner-split__inner">
        <StoryText {...props} id={id} className="banner-split__text" />
      </div>
      <figure className="banner-split__media">
        <TemplateImage section={section} editable={editable} field="image_url" className="banner-split__image" sizes="(min-width: 1024px) 50vw, 100vw" maxWidth={1200} alt={getString(section.settings, 'image_alt')} loading="lazy" />
      </figure>
    </section>
  )
}
