'use client'

import type { PublicBoard } from '@cms/types'
import { CONTENT_MAX, TITLE_MAX, useMemberPostForm } from '@/components/board/useMemberPostForm'
import { pageHref } from '../../../shared/contracts'
import { BoardGate } from './BoardGate'
import type { BoardLink } from './CustomBoardViews'

interface CustomBoardWriteProps {
  board: PublicBoard
  tenantSlug: string
  /** 있으면 그 글 고치기 */
  postId?: string
  link: BoardLink
  memberEnabled: boolean
}

/** 홈페이지 회원 글쓰기 · 고치기 (T-150-B) — 목업 board-form 모양 */
export function CustomBoardWrite({
  board,
  tenantSlug,
  postId,
  link,
  memberEnabled,
}: CustomBoardWriteProps) {
  const href = (id?: string) =>
    pageHref(tenantSlug, link.pageKey, link.previewQuery, { id, noSlug: link.noSlug })
  const form = useMemberPostForm(tenantSlug, board, postId, memberEnabled, (id) => {
    window.location.assign(href(id))
  })
  const heading = postId ? '글 수정' : '글쓰기'

  if (form.state === 'missing') {
    return (
      <section className="board-list" aria-label={board.name}>
        <div className="page-container">
          <p className="board-list__empty">고칠 수 있는 글이 아닙니다.</p>
        </div>
      </section>
    )
  }
  if (form.state !== 'ready') {
    return (
      <BoardGate
        title={`${board.name} ${heading}`}
        tenantSlug={tenantSlug}
        kind={form.state}
        text="로그인한 회원만 글을 쓸 수 있습니다."
      />
    )
  }

  const categories = board.categories ?? []
  return (
    <section className="board-form" aria-labelledby="member-write-title">
      <div className="page-container">
        <h2 className="board-list__title" id="member-write-title">
          {board.name} {heading}
        </h2>
        <form
          className="board-form__form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void form.submit()
          }}
        >
          <div className="board-form__panel">
            <p className="board-form__note">
              <span className="board-form__req" aria-hidden="true">
                *
              </span>
              는 필수 표기 항목입니다. 글은 등록하면 바로 홈페이지에 보입니다.
            </p>
            <div className="board-form__list">
              {categories.length > 0 && (
                <div className="board-form__row">
                  <label className="board-form__label" htmlFor="mw-category">
                    카테고리
                  </label>
                  <div className="board-form__field board-form__field--select">
                    <select
                      className="board-form__input board-form__select"
                      id="mw-category"
                      value={form.values.categoryId}
                      onChange={(e) => form.change({ categoryId: e.target.value })}
                    >
                      <option value="">분류 없음</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                    <i className="ri-arrow-down-s-line" aria-hidden="true" />
                  </div>
                </div>
              )}
              <div className="board-form__row">
                <label className="board-form__label" htmlFor="mw-title">
                  제목
                  <span className="board-form__req" aria-hidden="true">
                    *
                  </span>
                </label>
                <input
                  className="board-form__input"
                  type="text"
                  id="mw-title"
                  placeholder="제목을 입력해 주세요."
                  maxLength={TITLE_MAX}
                  required
                  value={form.values.title}
                  aria-invalid={form.errors.title ? true : undefined}
                  onChange={(e) => form.change({ title: e.target.value })}
                />
              </div>
              <div className="board-form__row">
                <label className="board-form__label" htmlFor="mw-content">
                  내용
                  <span className="board-form__req" aria-hidden="true">
                    *
                  </span>
                </label>
                <textarea
                  className="board-form__input board-form__textarea"
                  id="mw-content"
                  placeholder="내용을 입력해 주세요. 빈 줄로 문단을 나눕니다."
                  maxLength={CONTENT_MAX}
                  required
                  value={form.values.content}
                  aria-invalid={form.errors.content ? true : undefined}
                  aria-describedby="mw-content-help"
                  onChange={(e) => form.change({ content: e.target.value })}
                />
                <p className="board-form__help" id="mw-content-help">
                  {form.values.content.length.toLocaleString()} / {CONTENT_MAX.toLocaleString()}자
                </p>
              </div>
            </div>
            <p className="board-form__status" role="status" aria-live="polite">
              {form.message}
            </p>
          </div>
          <div className="board-form__actions">
            <a className="board-form__cancel" href={postId ? href(postId) : href()}>
              취소
            </a>
            <button className="board-form__submit" type="submit" disabled={form.submitting}>
              {form.submitting ? '저장 중…' : postId ? '저장' : '등록'}
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
