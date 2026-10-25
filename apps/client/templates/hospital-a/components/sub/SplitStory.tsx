import { getBoolean, getString } from '@/lib/sectionSettings'
import type { CodeSectionProps } from '../../../shared/contracts'
import { StoryText } from './StoryText'
import { RichLine } from './RichText'
import { titleId } from './ids'

interface Props extends CodeSectionProps {
  /** 사진 | 글 순서 (layout=split-story-reverse) */
  reverse?: boolean
}

/**
 * 글 | 사진 2단 — 목업 sub/split-story.html · split-story-reverse.html
 * 설정 키: en_title · sub_title · paragraphs · image_url · image_alt · caption(사진 설명) · lined(위 구분선·가운데 세로선)
 */
export function SplitStory({ reverse = false, ...props }: Props) {
  const { section } = props
  const id = titleId('split-story', section.id)
  const lined = getBoolean(section.settings, 'lined')
  const caption = getString(section.settings, 'caption')
  const classes = ['split-story', lined ? 'split-story--lined' : null, reverse ? 'split-story--reverse' : null]
    .filter(Boolean)
    .join(' ')

  const media = (
    <figure className="split-story__media">
      {/* eslint-disable-next-line @next/next/no-img-element -- 목업 사진 비율 유지 */}
      <img className="split-story__image" src={getString(section.settings, 'image_url')} alt={getString(section.settings, 'image_alt')} loading="lazy" />
      {caption && (
        <figcaption className="split-story__caption">
          <RichLine text={caption} />
        </figcaption>
      )}
    </figure>
  )
  const text = <StoryText {...props} id={id} className="split-story__text" />

  return (
    <section className={classes} aria-labelledby={id}>
      <div className="page-container split-story__inner">
        {reverse ? (
          <>
            {media}
            {text}
          </>
        ) : (
          <>
            {text}
            {media}
          </>
        )}
      </div>
    </section>
  )
}
