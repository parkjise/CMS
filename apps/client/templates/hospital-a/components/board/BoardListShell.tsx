import type { ReactNode } from 'react'
import { BoardToolbar, type SearchTarget } from './BoardToolbar'
import { MemberWriteLink } from './MemberWriteLink'
import { NoticeWriteLink } from './NoticeWriteLink'
import { Pagination } from './Pagination'

interface BoardListShellProps {
  title: string
  description?: string
  /** 관리자에게 [글쓰기]를 보여 줄 게시판 슬러그 — 샘플 미리보기면 없음 */
  writeBoard?: string
  total: number
  page: number
  totalPages: number
  keyword: string
  hrefFor: (extra?: { id?: string; q?: string; p?: number }) => string
  searchTarget: SearchTarget
  searchLabel: string
  /** 검색창 위 카테고리 탭 (T-149) */
  tabs?: ReactNode
  /** 회원 글쓰기 게시판의 [글쓰기] 주소 (T-150-B) */
  memberWriteHref?: string
  children: ReactNode
}

/** 게시판 목록 공통 틀 — 제목 · 글쓰기 · 검색 · 페이지 이동. 글 모양은 유형별로 (T-140-B) */
export function BoardListShell({
  title,
  description,
  writeBoard,
  total,
  page,
  totalPages,
  keyword,
  hrefFor,
  searchTarget,
  searchLabel,
  tabs,
  memberWriteHref,
  children,
}: BoardListShellProps) {
  return (
    <section className="board-list" aria-labelledby="board-list-title">
      <div className="page-container">
        <h2 className="board-list__title" id="board-list-title">
          {title}
        </h2>
        {description && <p className="board-list__desc">{description}</p>}
        {writeBoard && <NoticeWriteLink board={writeBoard} />}
        {memberWriteHref && <MemberWriteLink href={memberWriteHref} />}
        {tabs}
        <BoardToolbar
          total={total}
          q={keyword}
          label={searchLabel}
          inputId="board-search"
          target={searchTarget}
          className="board-list__toolbar"
        />
        {children}
        <Pagination
          page={page}
          totalPages={totalPages}
          hrefFor={(p) => hrefFor({ q: keyword || undefined, p })}
          className="board-list__pagination"
        />
      </div>
    </section>
  )
}

export function BoardEmpty({ keyword, emptyText }: { keyword: string; emptyText: string }) {
  return (
    <>
      <ul className="board-list__list" />
      <p className="board-list__empty">{keyword ? '검색 결과가 없습니다.' : emptyText}</p>
    </>
  )
}
