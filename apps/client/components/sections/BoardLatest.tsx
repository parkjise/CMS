import { headers } from 'next/headers'
import { ChevronDown } from 'lucide-react'
import type { PublicBoard, PublicSectionPost } from '@cms/types'
import { EditableText } from '@/components/edit/EditableText'
import { CONNECT_MAX_COUNT, connectOptions, latestBoard, latestCount } from '@/lib/latestBoard'
import { boardPageKey, fetchSectionPosts, fieldValueText, postDate } from '@/lib/publicPosts'
import { getString, getValueType } from '@/lib/sectionSettings'
import { CUSTOM_HOST_HEADER } from '@/lib/siteHost'
import { pageHref } from '@/templates/shared/contracts'
import { RichBody } from '@/templates/shared/RichBody'
import type { SectionProps } from './types'

const DEFAULT_COUNT = 5
/** 연혁의 연도 칸 — 콘텐츠형 '연혁' 프리셋이 만든다. 없으면 공개일의 해 */
const YEAR_FIELD = 'year'

const primary = 'text-[color:var(--color-text-primary)]'
const muted = 'text-[color:var(--color-text-muted)]'
const line = 'border-[color:var(--color-border)]'

interface BoardLatestProps extends SectionProps {
  boards?: PublicBoard[] | null
}

/** 2026-11-05 → 2026.11.05 */
const dotted = (iso: string): string => postDate(iso).replaceAll('-', '.')

/** 직책 · 전문 분야처럼 글 목록에 표시로 고른 칸 — 연혁의 연도는 앞에 따로 */
const FieldLine = ({ post }: { post: PublicSectionPost }) => {
  const fields = post.fields.filter((f) => f.key !== YEAR_FIELD)
  if (!fields.length) return null
  return <p className={`mt-1 text-sm ${muted}`}>{fields.map(fieldValueText).join(' · ')}</p>
}

const yearOf = (post: PublicSectionPost): string => {
  const year = post.fields.find((f) => f.key === YEAR_FIELD)
  return year ? fieldValueText(year) : postDate(post.published_at).slice(0, 4)
}

/**
 * 테마형 게시판 연결 섹션 (T-185 최신 글 → T-243) — 고른 게시판의 공개 글을
 * 목록 · 카드 · FAQ · 연혁으로. 칸은 고정: 제목 · 본문 요약 · 첫 사진 · 공개일.
 * 비밀글 · 회원 전용 게시판의 글은 서버가 보내지 않는다.
 * 게시판이 없거나 글이 없으면 그리지 않는다 — 빈 결과 문구를 정했으면 그 문구만.
 */
export async function BoardLatest({ section, tenantSlug, boards }: BoardLatestProps) {
  const board = latestBoard(section, boards)
  if (!board) return null
  const { mode, sort, category, emptyText } = connectOptions(section)
  const posts = await fetchSectionPosts(tenantSlug, board.slug, {
    size: latestCount(section, DEFAULT_COUNT, CONNECT_MAX_COUNT),
    sort,
    category,
    body: mode === 'FAQ',
  })
  if (!posts || (!posts.length && !emptyText)) return null

  const noSlug = Boolean((await headers()).get(CUSTOM_HOST_HEADER))
  const key = boardPageKey(board.slug)
  const postHref = (id: string) => pageHref(tenantSlug, key, undefined, { id, noSlug })
  const title = getString(section.settings, 'section_title')

  return (
    <section
      data-section-id={section.id}
      data-section-type="BOARD_LATEST"
      data-display={mode}
      className="bg-[var(--color-background)] px-6 py-16 md:py-24"
    >
      <div className={`mx-auto ${mode === 'CARD' ? 'max-w-6xl' : 'max-w-4xl'}`}>
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
              className={`text-2xl font-bold md:text-3xl ${primary}`}
            />
          )}
          {mode === 'LIST' && posts.length > 0 && (
            <a
              href={pageHref(tenantSlug, key, undefined, { noSlug })}
              className="ml-auto shrink-0 text-sm font-medium text-[color:var(--color-primary)] hover:underline"
            >
              전체 보기<span className="sr-only"> — {board.name}</span>
            </a>
          )}
        </div>

        {!posts.length ? (
          <p className={`mt-8 text-center ${muted}`}>{emptyText}</p>
        ) : mode === 'CARD' ? (
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <li key={post.id}>
                <a
                  href={postHref(post.id)}
                  className={`group block h-full overflow-hidden rounded-xl border ${line} bg-[var(--color-surface)] hover:shadow-md`}
                >
                  {post.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element -- 고객이 올린 글 사진
                    <img
                      src={post.thumbnail}
                      alt=""
                      loading="lazy"
                      className="aspect-[4/3] w-full object-cover"
                    />
                  )}
                  <div className="p-5">
                    <h3
                      className={`font-semibold group-hover:text-[color:var(--color-primary)] ${primary}`}
                    >
                      {post.title}
                    </h3>
                    <FieldLine post={post} />
                    {post.summary && (
                      <p className={`mt-2 line-clamp-3 text-sm leading-relaxed ${muted}`}>
                        {post.summary}
                      </p>
                    )}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        ) : mode === 'FAQ' ? (
          <div className={`mt-8 border-t ${line}`}>
            {posts.map((post) => (
              <details key={post.id} className={`group border-b ${line}`}>
                <summary
                  className={`flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-medium ${primary} [&::-webkit-details-marker]:hidden`}
                >
                  {post.title}
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 transition group-open:rotate-180 ${muted}`}
                    aria-hidden
                  />
                </summary>
                <div className={`rich-body pb-6 leading-relaxed ${primary}`}>
                  <RichBody nodes={post.body ?? []} />
                </div>
              </details>
            ))}
          </div>
        ) : mode === 'TIMELINE' ? (
          <ol className={`mt-8 space-y-8 border-l-2 pl-6 ${line}`}>
            {posts.map((post) => (
              <li key={post.id} className="relative">
                <span
                  aria-hidden
                  className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full bg-[var(--color-primary)]"
                />
                <p className="text-sm font-semibold text-[color:var(--color-primary)]">
                  {yearOf(post)}
                </p>
                <h3 className={`mt-1 font-semibold ${primary}`}>{post.title}</h3>
                <FieldLine post={post} />
                {post.summary && (
                  <p className={`mt-1 text-sm leading-relaxed ${muted}`}>{post.summary}</p>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <ul className={`mt-8 divide-y divide-[color:var(--color-border)] border-y ${line}`}>
            {posts.map((post) => (
              <li key={post.id}>
                <a
                  href={postHref(post.id)}
                  className={`flex items-center justify-between gap-4 py-4 hover:text-[color:var(--color-primary)] ${primary}`}
                >
                  <span className="min-w-0 truncate">{post.title}</span>
                  <time
                    dateTime={postDate(post.published_at)}
                    className={`shrink-0 text-sm ${muted}`}
                  >
                    {dotted(post.published_at)}
                  </time>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
