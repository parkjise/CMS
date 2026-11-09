import { PublicListTable } from './PublicListTable'
import type { ReactNode } from 'react'
import { ListFieldValues } from './ListFieldValues'
import type { BodyNode, PublicBoard, PublicPost } from '@cms/types'
import { ChevronDown, Lock, Search } from 'lucide-react'
import {
  type BoardPage,
  EDIT_PAGE,
  SECRET_TEXT,
  WRITE_PAGE,
  boardDesign,
  canMemberWrite,
  loadBoardPage,
} from '@/lib/boardRoute'
import { fieldValueText, postDate } from '@/lib/publicPosts'
import { FieldValue } from './FieldValue'
import { RichBody } from '@/templates/shared/RichBody'
import { ThemeGuestPostActions, ThemeReportButton } from './ThemeGuestTools'
import { ThemeMemberPostActions, ThemeMemberWriteLink, ThemeSecretNotice } from './ThemeMemberLinks'
import { ThemeWriteLink } from './ThemeWriteLink'

const muted = 'text-[color:var(--color-text-muted)]'
const primary = 'text-[color:var(--color-text-primary)]'
const line = 'border-[color:var(--color-border)]'

/** 2026-11-05 → 2026.11.05 */
const dotted = (iso: string): string => postDate(iso).replaceAll('-', '.')

function Body({ blocks }: { blocks: BodyNode[] }) {
  return (
    <div className={`rich-body leading-relaxed ${primary}`}>
      <RichBody nodes={blocks} />
    </div>
  )
}

interface PagerProps {
  page: number
  totalPages: number
  hrefFor: (page: number) => string
}

const WINDOW = 5

function Pager({ page, totalPages, hrefFor }: PagerProps) {
  if (totalPages <= 1) return null
  const start = Math.max(1, Math.min(page - Math.floor(WINDOW / 2), totalPages - WINDOW + 1))
  const pages = Array.from({ length: Math.min(WINDOW, totalPages) }, (_, i) => start + i)
  return (
    <nav
      className="mt-10 flex flex-wrap items-center justify-center gap-1"
      aria-label="페이지 이동"
    >
      {pages.map((p) => (
        <a
          key={p}
          href={hrefFor(p)}
          aria-current={p === page ? 'page' : undefined}
          className={`flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm ${
            p === page
              ? 'bg-[var(--color-primary)] text-white'
              : `${primary} hover:bg-[var(--color-surface)]`
          }`}
        >
          {p}
        </a>
      ))}
    </nav>
  )
}

export interface HrefExtra {
  id?: string
  q?: string
  p?: number
  /** 카테고리 id (T-149) */
  c?: string
}

interface DetailProps {
  board: PublicBoard
  post: PublicPost
  hrefFor: (extra?: HrefExtra) => string
  tenantSlug: string
  /** 잠긴 비밀글 안내를 바꿔 끼운다 — 비회원 비밀글은 비밀번호 칸 (T-151-B) */
  secretActions?: ReactNode
}

/** 글 상세 — 유형과 관계없이 같은 모양 */
export function ThemeBoardDetail({ board, post, hrefFor, tenantSlug, secretActions }: DetailProps) {
  const navLink = `text-sm ${primary} hover:text-[color:var(--color-primary)]`
  return (
    <section className="mx-auto max-w-3xl px-6 py-12 md:py-16">
      <p className={`text-sm ${muted}`}>{board.name}</p>
      <h1 className={`mt-2 text-2xl font-bold md:text-3xl ${primary}`}>{post.title}</h1>
      <time className={`mt-2 block text-sm ${muted}`} dateTime={postDate(post.published_at)}>
        {dotted(post.published_at)}
      </time>
      <div className="mt-3 flex justify-end gap-2 empty:hidden">
        <ThemeWriteLink board={board.slug} post={post.id} />
        {canMemberWrite(board) && !post.locked && post.is_guest && (
          <ThemeGuestPostActions
            board={board}
            tenantSlug={tenantSlug}
            postId={post.id}
            editHref={hrefFor({ id: `${post.id}/${EDIT_PAGE}` })}
            listHref={hrefFor()}
          />
        )}
        {canMemberWrite(board) && !post.is_guest && (
          <ThemeMemberPostActions
            board={board}
            tenantSlug={tenantSlug}
            postId={post.id}
            editHref={hrefFor({ id: `${post.id}/${EDIT_PAGE}` })}
            listHref={hrefFor()}
          />
        )}
      </div>
      <div className={`mt-6 border-t pt-6 ${line}`}>
        {post.fields && post.fields.length > 0 && (
          <dl className={`mb-6 divide-y border-b ${line} divide-[color:var(--color-border)]`}>
            {post.fields.map((field) => (
              <div
                key={field.key}
                className="grid grid-cols-[6rem_1fr] gap-3 py-2.5 md:grid-cols-[10rem_1fr]"
              >
                <dt className={`text-sm font-medium ${muted}`}>{field.label}</dt>
                <dd className={`min-w-0 whitespace-pre-line break-words text-sm ${primary}`}>
                  {field.field_type === 'IMAGE' ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 고객이 올린 칸 사진
                    <img
                      src={String(field.value)}
                      alt={field.label}
                      loading="lazy"
                      className="h-auto max-w-full rounded-lg"
                    />
                  ) : (
                    <FieldValue field={field} />
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {post.locked ? (
          (secretActions ?? <ThemeSecretNotice tenantSlug={tenantSlug} />)
        ) : (
          <>
            <Body blocks={post.body} />
            <ThemeReportButton board={board} tenantSlug={tenantSlug} postId={post.id} />
          </>
        )}
      </div>
      <nav
        className={`mt-10 flex items-center justify-between border-t pt-6 ${line}`}
        aria-label="게시글 이동"
      >
        {post.prev_id ? (
          <a className={navLink} href={hrefFor({ id: post.prev_id })}>
            이전 게시글
          </a>
        ) : (
          <span />
        )}
        <a className={navLink} href={hrefFor()}>
          목록보기
        </a>
        {post.next_id ? (
          <a className={navLink} href={hrefFor({ id: post.next_id })}>
            다음 게시글
          </a>
        ) : (
          <span />
        )}
      </nav>
    </section>
  )
}

// 게시판 디자인 (T-148) — Tailwind 가 찾을 수 있게 전체 클래스로 적는다
const COLUMN_CLASS = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' }
const RATIO_CLASS = { '1:1': 'aspect-square', '4:3': 'aspect-[4/3]', '16:9': 'aspect-video' }

interface ListProps {
  board: PublicBoard
  tenantSlug: string
  q?: string
  c?: string
  page: number
  hrefFor: (extra?: HrefExtra) => string
  /** 검색 폼이 보낼 주소 */
  searchAction: string
}

/** 고객이 추가한 게시판 — 테마형 (테마 CSS 변수로 6종이 함께 쓴다, T-141) */
export async function ThemeBoardList({
  board,
  tenantSlug,
  q,
  c,
  page,
  hrefFor,
  searchAction,
}: ListProps) {
  const list = await loadBoardPage(tenantSlug, board, { page, q, c })
  return (
    <ThemeBoardListView board={board} list={list} hrefFor={hrefFor} searchAction={searchAction} />
  )
}

interface ListViewProps {
  board: PublicBoard
  list: BoardPage
  hrefFor: (extra?: HrefExtra) => string
  searchAction: string
}

/** 유형별 글 목록 — 서버(공개 게시판)와 브라우저(회원 게시판, T-150)가 같이 쓴다 */
export function ThemeBoardListView({ board, list, hrefFor, searchAction }: ListViewProps) {
  const { posts, keyword, category } = list
  const categories = board.categories ?? []
  const design = boardDesign(board)
  const ratio = RATIO_CLASS[design.image_ratio]
  return (
    <section className="mx-auto max-w-5xl px-6 py-12 md:py-16">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className={`text-2xl font-bold md:text-3xl ${primary}`}>{board.name}</h1>
          {board.description && <p className={`mt-2 text-sm ${muted}`}>{board.description}</p>}
        </div>
        <div className="flex gap-2 empty:hidden">
          <ThemeWriteLink board={board.slug} />
          {canMemberWrite(board) && <ThemeMemberWriteLink href={hrefFor({ id: WRITE_PAGE })} />}
        </div>
      </div>

      {categories.length > 0 && (
        <nav aria-label="카테고리" className="mt-8">
          <ul className="flex gap-2 overflow-x-auto pb-0.5 md:flex-wrap">
            {[{ id: undefined, name: '전체' }, ...categories].map((tab) => {
              const active = tab.id === category
              return (
                <li key={tab.id ?? 'all'} className="shrink-0">
                  <a
                    href={hrefFor({ c: tab.id })}
                    aria-current={active ? 'page' : undefined}
                    className={`block whitespace-nowrap rounded-full border px-4 py-1.5 text-sm ${
                      active
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)] font-semibold text-white'
                        : `${line} ${muted} hover:text-[color:var(--color-text-primary)]`
                    }`}
                  >
                    {tab.name}
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <p className={`text-sm ${muted}`}>총 {list.total.toLocaleString()}건</p>
        <form role="search" action={searchAction} method="get" className="relative w-full sm:w-64">
          {category && <input type="hidden" name="c" value={category} />}
          <label className="sr-only" htmlFor="board-search">
            {board.name} 검색
          </label>
          <input
            id="board-search"
            type="search"
            name="q"
            defaultValue={keyword}
            maxLength={60}
            placeholder="검색어를 입력해 주세요."
            className={`h-10 w-full rounded-md border bg-transparent pl-3 pr-10 text-sm ${line} ${primary}`}
          />
          <button type="submit" aria-label="검색" className={`absolute right-2 top-2 ${muted}`}>
            <Search className="h-5 w-5" aria-hidden />
          </button>
        </form>
      </div>

      {posts.length === 0 ? (
        <p className={`mt-6 border-t py-16 text-center text-sm ${line} ${muted}`}>
          {keyword ? '검색 결과가 없습니다.' : '등록된 글이 없습니다.'}
        </p>
      ) : board.board_type === 'LIST' &&
        design.list_layout === 'columns' &&
        list.list_columns?.length ? (
        <PublicListTable
          rows={posts.map((post) => ({
            id: post.id,
            title: post.title,
            date: postDate(post.published_at),
            pinned: post.is_pinned,
            secret: post.is_secret,
            fields: post.list_fields,
          }))}
          columns={list.list_columns}
          showDate={design.show_date}
          hrefFor={hrefFor}
          classes={{
            scroll: 'mt-6 overflow-x-auto focus-visible:outline focus-visible:outline-2',
            table: 'min-w-full text-left text-sm',
            head: `min-w-40 border-b px-4 py-3 font-semibold ${line} ${primary}`,
            cell: `min-w-40 max-w-80 whitespace-pre-wrap border-b px-4 py-3 align-top [overflow-wrap:anywhere] ${line} ${muted}`,
            title: 'min-w-64',
            link: `font-medium hover:underline ${primary}`,
            badge: 'mr-2 rounded bg-[var(--color-surface)] px-2 py-0.5 text-xs',
            date: 'whitespace-nowrap',
          }}
        />
      ) : board.board_type === 'GALLERY' ? (
        <ul
          className={`mt-6 grid grid-cols-2 gap-x-4 gap-y-8 md:gap-x-6 ${COLUMN_CLASS[design.columns]}`}
        >
          {posts.map((post) => (
            <li key={post.id}>
              <a href={hrefFor({ id: post.id })} className="group block">
                {post.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 고객이 올린 글 사진
                  <img
                    src={post.thumbnail}
                    alt=""
                    loading="lazy"
                    className={`${ratio} w-full rounded-lg object-cover`}
                  />
                ) : (
                  // 사진 없는 글 (D-03)
                  <span
                    data-empty-thumb
                    className={`block ${ratio} w-full rounded-lg bg-[var(--color-surface)]`}
                    aria-hidden
                  />
                )}
                <span className={`mt-3 block font-semibold group-hover:underline ${primary}`}>
                  {post.is_secret && (
                    <Lock
                      className="mr-1 inline h-4 w-4 align-[-2px]"
                      aria-label="비밀글"
                      role="img"
                    />
                  )}
                  {post.title}
                </span>
                {!post.is_secret && (
                  <ListFieldValues
                    fields={post.list_fields}
                    className={`mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm ${muted}`}
                    itemClassName="min-w-0 break-words [overflow-wrap:anywhere]"
                  />
                )}
                {design.show_date && (
                  <time
                    className={`mt-1 block text-sm ${muted}`}
                    dateTime={postDate(post.published_at)}
                  >
                    {dotted(post.published_at)}
                  </time>
                )}
              </a>
            </li>
          ))}
        </ul>
      ) : board.board_type === 'CARD' ? (
        <ul className={`mt-6 grid grid-cols-1 gap-5 md:gap-7 ${COLUMN_CLASS[design.columns]}`}>
          {posts.map((post) => (
            <li key={post.id} className="min-w-0">
              <a
                href={hrefFor({ id: post.id })}
                className={`group flex h-full flex-col overflow-hidden rounded-xl border ${line}`}
              >
                {design.show_image && post.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element -- 고객이 올린 글 사진
                  <img
                    src={post.thumbnail}
                    alt=""
                    loading="lazy"
                    className={`${ratio} w-full object-cover`}
                  />
                )}
                <span className="flex flex-1 flex-col gap-2 p-5">
                  {post.is_pinned && (
                    <span className="self-start rounded bg-[var(--color-surface)] px-2 py-0.5 text-xs">
                      공지
                    </span>
                  )}
                  <span className={`font-semibold group-hover:underline ${primary}`}>
                    {post.is_secret && (
                      <Lock
                        className="mr-1 inline h-4 w-4 align-[-2px]"
                        aria-label="비밀글"
                        role="img"
                      />
                    )}
                    {post.title}
                  </span>
                  {design.show_summary && post.summary && (
                    <span className={`line-clamp-3 text-sm ${muted}`}>{post.summary}</span>
                  )}
                  {post.card_fields?.map((field) => (
                    <span key={field.key} className={`break-words text-sm ${muted}`}>
                      {field.label}: {field.field_type === 'IMAGE' ? '사진' : fieldValueText(field)}
                    </span>
                  ))}
                  {design.show_date && (
                    <time
                      className={`mt-auto pt-1 text-sm ${muted}`}
                      dateTime={postDate(post.published_at)}
                    >
                      {dotted(post.published_at)}
                    </time>
                  )}
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : board.board_type === 'FAQ' ? (
        <div className={`mt-6 border-t ${line}`}>
          {posts.map((post, index) => (
            <details
              key={post.id}
              className={`group border-b ${line}`}
              name={design.faq_single_open ? `faq-${board.slug}` : undefined}
              open={design.faq_first_open && index === 0}
            >
              <summary
                className={`flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-semibold ${primary} [&::-webkit-details-marker]:hidden`}
              >
                <span className="min-w-0">
                  {post.is_secret && (
                    <Lock
                      className="mr-1 inline h-4 w-4 align-[-2px]"
                      aria-label="비밀글"
                      role="img"
                    />
                  )}
                  {post.title}
                  {!post.is_secret && (
                    <ListFieldValues
                      fields={post.list_fields}
                      className={`mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm font-normal ${muted}`}
                      itemClassName="min-w-0 break-words [overflow-wrap:anywhere]"
                    />
                  )}
                </span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 transition group-open:rotate-180 ${muted}`}
                  aria-hidden
                />
              </summary>
              <div className="pb-6">
                {post.is_secret ? (
                  <p className={`text-sm ${muted}`}>{SECRET_TEXT}</p>
                ) : (
                  <Body blocks={post.body ?? []} />
                )}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <ul className={`mt-6 border-t ${line}`}>
          {posts.map((post) => (
            <li key={post.id} className={`border-b ${line}`}>
              <a
                href={hrefFor({ id: post.id })}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-4 hover:bg-[var(--color-surface)] md:px-2"
              >
                <span className="min-w-0 flex-1">
                  <span className={`font-medium ${primary}`}>
                    {post.is_pinned && (
                      <span className="mr-2 rounded bg-[var(--color-surface)] px-2 py-0.5 text-xs">
                        공지
                      </span>
                    )}
                    {post.is_secret && (
                      <Lock
                        className="mr-1 inline h-4 w-4 align-[-2px]"
                        aria-label="비밀글"
                        role="img"
                      />
                    )}
                    {post.title}
                  </span>
                  {!post.is_secret && (
                    <ListFieldValues
                      fields={post.list_fields}
                      className={`mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm ${muted}`}
                      itemClassName="min-w-0 break-words [overflow-wrap:anywhere]"
                    />
                  )}
                </span>
                {design.show_date && (
                  <time className={`text-sm ${muted}`} dateTime={postDate(post.published_at)}>
                    {dotted(post.published_at)}
                  </time>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}

      <Pager
        page={list.page}
        totalPages={list.totalPages}
        hrefFor={(p) => hrefFor({ q: keyword || undefined, p, c: category })}
      />
    </section>
  )
}
