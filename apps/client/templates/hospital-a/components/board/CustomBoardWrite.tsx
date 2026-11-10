'use client'

import type { PublicBoard } from '@cms/types'
import {
  CONTENT_MAX,
  GUEST_NAME_MAX,
  GUEST_PASSWORD_MAX,
  TITLE_MAX,
  useMemberPostForm,
} from '@/components/board/useMemberPostForm'
import { pageHref } from '../../../shared/contracts'
import { categoryOptions } from '@/lib/categoryTabs'
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
  if (form.state === 'password') {
    // 비회원 글 고치기 — 글 비밀번호부터 (T-151-B)
    return (
      <section className="board-form" aria-labelledby="guest-password-title">
        <div className="page-container">
          <h2 className="board-list__title" id="guest-password-title">
            {board.name} {heading}
          </h2>
          <form
            className="board-form__form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              void form.unlock()
            }}
          >
            <div className="board-form__panel">
              <div className="board-form__row">
                <label className="board-form__label" htmlFor="gw-unlock">
                  글 비밀번호
                </label>
                <input
                  className="board-form__input"
                  type="password"
                  id="gw-unlock"
                  autoComplete="off"
                  maxLength={GUEST_PASSWORD_MAX}
                  value={form.values.password}
                  aria-invalid={form.errors.password ? true : undefined}
                  aria-describedby="gw-unlock-help"
                  onChange={(e) => form.change({ password: e.target.value })}
                />
                <p className="board-form__help" id="gw-unlock-help">
                  {form.errors.password ?? '글을 쓸 때 정한 비밀번호를 입력해 주세요.'}
                </p>
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
                확인
              </button>
            </div>
          </form>
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
              {form.guest && !postId && (
                // 비회원 글쓰기 (T-151-B) — 이름 · 글 비밀번호
                <div className="board-form__cols board-form__cols--fields">
                  <div className="board-form__row">
                    <label className="board-form__label" htmlFor="gw-name">
                      이름
                      <span className="board-form__req" aria-hidden="true">
                        *
                      </span>
                    </label>
                    <input
                      className="board-form__input"
                      type="text"
                      id="gw-name"
                      autoComplete="name"
                      placeholder="이름을 입력해 주세요."
                      maxLength={GUEST_NAME_MAX}
                      value={form.values.name}
                      aria-invalid={form.errors.name ? true : undefined}
                      onChange={(e) => form.change({ name: e.target.value })}
                    />
                  </div>
                  <div className="board-form__row">
                    <label className="board-form__label" htmlFor="gw-password">
                      글 비밀번호
                      <span className="board-form__req" aria-hidden="true">
                        *
                      </span>
                    </label>
                    <input
                      className="board-form__input"
                      type="password"
                      id="gw-password"
                      autoComplete="new-password"
                      placeholder="4자리 이상 입력해 주세요."
                      maxLength={GUEST_PASSWORD_MAX}
                      value={form.values.password}
                      aria-invalid={form.errors.password ? true : undefined}
                      aria-describedby="gw-password-help"
                      onChange={(e) => form.change({ password: e.target.value })}
                    />
                    <p className="board-form__help" id="gw-password-help">
                      글을 고치거나 지울 때 필요해요.
                    </p>
                  </div>
                </div>
              )}
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
                      {categoryOptions(categories).map((category) => (
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
              {form.guest && !postId && (
                <div className="board-form__row board-form__row--check">
                  <input
                    className="board-form__checkbox"
                    type="checkbox"
                    id="gw-agree"
                    checked={form.values.agree}
                    aria-invalid={form.errors.agree ? true : undefined}
                    onChange={(e) => form.change({ agree: e.target.checked })}
                  />
                  <label className="board-form__check" htmlFor="gw-agree">
                    개인정보 수집 · 이용 동의
                    <span className="board-form__req" aria-hidden="true">
                      *
                    </span>{' '}
                    <span className="board-form__help">(이름은 글 관리에만 쓰이고 글과 함께 보관됩니다.)</span>
                  </label>
                </div>
              )}
              {form.secretChoice && (
                <div className="board-form__row board-form__row--check">
                  <input
                    className="board-form__checkbox"
                    type="checkbox"
                    id="mw-secret"
                    checked={form.values.isSecret}
                    onChange={(e) => form.change({ isSecret: e.target.checked })}
                  />
                  <label className="board-form__check" htmlFor="mw-secret">
                    비밀글로 등록 <span className="board-form__help">(나와 관리자만 볼 수 있어요)</span>
                  </label>
                </div>
              )}
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
