import { headers } from 'next/headers'
import type { PublicBoard } from '@cms/types'
import { EditableText } from '@/components/edit/EditableText'
import { latestBoard, latestCount } from '@/lib/latestBoard'
import { boardPageKey, fetchPublicPosts, postDate } from '@/lib/publicPosts'
import { getString, getValueType } from '@/lib/sectionSettings'
import { CUSTOM_HOST_HEADER } from '@/lib/siteHost'
import { pageHref } from '@/templates/shared/contracts'
import type { SectionProps } from './types'

const DEFAULT_COUNT = 5

interface BoardLatestProps extends SectionProps {
  boards?: PublicBoard[] | null
}

/**
 * 테마형 메인 화면 최신 글 (T-185) — 고른 게시판의 공개 글 최신순.
 * 게시판을 고르지 않았거나 공개 글이 없으면 그리지 않는다 (빈 상자를 보이지 않게).
 */
export async function BoardLatest({ section, tenantSlug, boards }: BoardLatestProps) {
  const board = latestBoard(section, boards)
  if (!board) return null
  const posts = await fetchPublicPosts(tenantSlug, board.slug, {
    size: latestCount(section, DEFAULT_COUNT),
    order: 'latest',
  })
  if (!posts?.items.length) return null

  const noSlug = Boolean((await headers()).get(CUSTOM_HOST_HEADER))
  const key = boardPageKey(board.slug)
  const title = getString(section.settings, 'section_title')

  return (
    <section
      data-section-id={section.id}
      data-section-type="BOARD_LATEST"
      className="bg-[var(--color-background)] px-6 py-16 md:py-24"
    >
      <div className="mx-auto max-w-4xl">
        <div className="flex items-end justify-between gap-4">
          {title && (
            <EditableText
              as="h2"
              sectionId={section.id}
              field="section_title"
              valueType={getValueType(section.settings, 'section_title')}
              formatting
              initialValue={title}
              maxLength={40}
              className="text-2xl font-bold text-[color:var(--color-text-primary)] md:text-3xl"
            />
          )}
          <a
            href={pageHref(tenantSlug, key, undefined, { noSlug })}
            className="ml-auto shrink-0 text-sm font-medium text-[color:var(--color-primary)] hover:underline"
          >
            전체 보기<span className="sr-only"> — {board.name}</span>
          </a>
        </div>
        <ul className="mt-8 divide-y divide-[color:var(--color-border)] border-y border-[color:var(--color-border)]">
          {posts.items.map((post) => (
            <li key={post.id}>
              <a
                href={pageHref(tenantSlug, key, undefined, { id: post.id, noSlug })}
                className="flex items-center justify-between gap-4 py-4 text-[color:var(--color-text-primary)] hover:text-[color:var(--color-primary)]"
              >
                <span className="min-w-0 truncate">
                  {post.title}
                  {post.is_secret && (
                    <span className="ml-2 text-xs text-[color:var(--color-text-muted)]">비밀글</span>
                  )}
                </span>
                <time
                  dateTime={postDate(post.published_at)}
                  className="shrink-0 text-sm text-[color:var(--color-text-muted)]"
                >
                  {postDate(post.published_at).replaceAll('-', '.')}
                </time>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
