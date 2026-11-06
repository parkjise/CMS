'use client'

import type { PublicBoard } from '@cms/types'
import { Lock } from 'lucide-react'
import { pageHref } from '@/templates/shared/contracts'
import {
  CONTENT_MAX,
  GUEST_NAME_MAX,
  GUEST_PASSWORD_MAX,
  TITLE_MAX,
  useMemberPostForm,
} from './useMemberPostForm'
import { memberLoginHref } from './useMemberBoard'

interface ThemeBoardWriteProps {
  board: PublicBoard
  tenantSlug: string
  postId?: string
  /** 게시판 페이지 키 (b/{slug}) */
  pageKey: string
  noSlug: boolean
  memberEnabled: boolean
}

const muted = 'text-[color:var(--color-text-muted)]'
const primary = 'text-[color:var(--color-text-primary)]'
const field = `w-full rounded-md border border-[color:var(--color-border)] bg-transparent px-3 text-base md:text-sm ${primary} aria-[invalid=true]:border-red-500`

/** 홈페이지 회원 글쓰기 · 고치기 — 테마형 (T-150-B) */
export function ThemeBoardWrite({
  board,
  tenantSlug,
  postId,
  pageKey,
  noSlug,
  memberEnabled,
}: ThemeBoardWriteProps) {
  const href = (id?: string) => pageHref(tenantSlug, pageKey, undefined, { id, noSlug })
  const form = useMemberPostForm(tenantSlug, board, postId, memberEnabled, (id) =>
    window.location.assign(href(id))
  )
  const heading = `${board.name} ${postId ? '글 수정' : '글쓰기'}`
  const categories = board.categories ?? []

  if (form.state === 'password') {
    // 비회원 글 고치기 — 글 비밀번호부터 (T-151-B)
    return (
      <section className="mx-auto max-w-3xl px-6 py-12 md:py-16">
        <h1 className={`text-2xl font-bold md:text-3xl ${primary}`}>{heading}</h1>
        <form
          className="mt-8 space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void form.unlock()
          }}
        >
          <div>
            <label htmlFor="tw-unlock" className={`mb-1.5 block text-sm font-medium ${primary}`}>
              글 비밀번호
            </label>
            <input
              id="tw-unlock"
              type="password"
              autoComplete="off"
              maxLength={GUEST_PASSWORD_MAX}
              className={`h-11 ${field}`}
              value={form.values.password}
              aria-invalid={form.errors.password ? true : undefined}
              onChange={(e) => form.change({ password: e.target.value })}
            />
            <p className={`mt-1 text-sm ${form.errors.password ? 'text-red-600' : muted}`}>
              {form.errors.password ?? '글을 쓸 때 정한 비밀번호를 입력해 주세요.'}
            </p>
          </div>
          <p role="status" aria-live="polite" className="min-h-5 text-sm text-red-600">
            {form.message}
          </p>
          <div className="flex justify-end gap-2">
            <a
              href={postId ? href(postId) : href()}
              className={`rounded-full border border-[color:var(--color-border)] px-5 py-2.5 text-sm ${primary}`}
            >
              취소
            </a>
            <button
              type="submit"
              disabled={form.submitting}
              className="rounded-full bg-[var(--color-primary)] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              확인
            </button>
          </div>
        </form>
      </section>
    )
  }

  if (form.state !== 'ready') {
    const locked = form.state === 'login' || form.state === 'closed'
    const text =
      form.state === 'checking'
        ? '로그인 정보를 확인하고 있습니다…'
        : form.state === 'missing'
          ? '고칠 수 있는 글이 아닙니다.'
          : '로그인한 회원만 글을 쓸 수 있습니다.'
    return (
      <section className="mx-auto max-w-3xl px-6 py-12 md:py-16">
        <h1 className={`text-2xl font-bold md:text-3xl ${primary}`}>{heading}</h1>
        <div
          className="mt-8 flex flex-col items-center gap-4 border-y border-[color:var(--color-border)] px-5 py-16 text-center"
          aria-live="polite"
        >
          {locked && <Lock className={`h-8 w-8 ${muted}`} aria-hidden />}
          <p className={`font-semibold ${locked ? primary : muted}`}>{text}</p>
          {form.state === 'login' && (
            <a
              href={memberLoginHref(tenantSlug)}
              className="rounded-full bg-[var(--color-primary)] px-6 py-2.5 text-sm font-semibold text-white"
            >
              로그인
            </a>
          )}
          {form.state === 'closed' && <p className={`text-sm ${muted}`}>지금은 볼 수 없습니다.</p>}
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-3xl px-6 py-12 md:py-16">
      <h1 className={`text-2xl font-bold md:text-3xl ${primary}`}>{heading}</h1>
      <p className={`mt-2 text-sm ${muted}`}>글은 등록하면 바로 홈페이지에 보입니다.</p>
      <form
        className="mt-8 space-y-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void form.submit()
        }}
      >
        {form.guest && !postId && (
          // 비회원 글쓰기 (T-151-B) — 이름 · 글 비밀번호
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="tw-name" className={`mb-1.5 block text-sm font-medium ${primary}`}>
                이름 <span className="text-red-600">*</span>
              </label>
              <input
                id="tw-name"
                autoComplete="name"
                maxLength={GUEST_NAME_MAX}
                className={`h-11 ${field}`}
                placeholder="이름을 입력해 주세요."
                value={form.values.name}
                aria-invalid={form.errors.name ? true : undefined}
                onChange={(e) => form.change({ name: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="tw-password" className={`mb-1.5 block text-sm font-medium ${primary}`}>
                글 비밀번호 <span className="text-red-600">*</span>
              </label>
              <input
                id="tw-password"
                type="password"
                autoComplete="new-password"
                maxLength={GUEST_PASSWORD_MAX}
                className={`h-11 ${field}`}
                placeholder="4자리 이상 입력해 주세요."
                value={form.values.password}
                aria-invalid={form.errors.password ? true : undefined}
                aria-describedby="tw-password-help"
                onChange={(e) => form.change({ password: e.target.value })}
              />
              <p id="tw-password-help" className={`mt-1 text-xs ${muted}`}>
                글을 고치거나 지울 때 필요해요.
              </p>
            </div>
          </div>
        )}
        {categories.length > 0 && (
          <div>
            <label htmlFor="tw-category" className={`mb-1.5 block text-sm font-medium ${primary}`}>
              카테고리
            </label>
            <select
              id="tw-category"
              className={`h-11 ${field}`}
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
          </div>
        )}
        <div>
          <label htmlFor="tw-title" className={`mb-1.5 block text-sm font-medium ${primary}`}>
            제목 <span className="text-red-600">*</span>
          </label>
          <input
            id="tw-title"
            className={`h-11 ${field}`}
            maxLength={TITLE_MAX}
            placeholder="제목을 입력해 주세요."
            value={form.values.title}
            aria-invalid={form.errors.title ? true : undefined}
            onChange={(e) => form.change({ title: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="tw-content" className={`mb-1.5 block text-sm font-medium ${primary}`}>
            내용 <span className="text-red-600">*</span>
          </label>
          <textarea
            id="tw-content"
            className={`min-h-60 py-2.5 ${field}`}
            maxLength={CONTENT_MAX}
            placeholder="내용을 입력해 주세요. 빈 줄로 문단을 나눕니다."
            value={form.values.content}
            aria-invalid={form.errors.content ? true : undefined}
            aria-describedby="tw-content-help"
            onChange={(e) => form.change({ content: e.target.value })}
          />
          <p id="tw-content-help" className={`mt-1 text-right text-xs ${muted}`}>
            {form.values.content.length.toLocaleString()} / {CONTENT_MAX.toLocaleString()}자
          </p>
        </div>
        {form.guest && !postId && (
          <label className={`flex items-start gap-2 text-sm ${primary}`}>
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.values.agree}
              aria-invalid={form.errors.agree ? true : undefined}
              onChange={(e) => form.change({ agree: e.target.checked })}
            />
            <span>
              개인정보 수집 · 이용 동의 <span className="text-red-600">*</span>{' '}
              <span className={muted}>(이름은 글 관리에만 쓰이고 글과 함께 보관됩니다.)</span>
            </span>
          </label>
        )}
        {form.secretChoice && (
          <label className={`flex items-center gap-2 text-sm ${primary}`}>
            <input
              type="checkbox"
              checked={form.values.isSecret}
              onChange={(e) => form.change({ isSecret: e.target.checked })}
            />
            비밀글로 등록 <span className={muted}>(나와 관리자만 볼 수 있어요)</span>
          </label>
        )}
        <p role="status" aria-live="polite" className="min-h-5 text-sm text-red-600">
          {form.message}
        </p>
        <div className="flex justify-end gap-2">
          <a
            href={postId ? href(postId) : href()}
            className={`rounded-full border border-[color:var(--color-border)] px-5 py-2.5 text-sm ${primary}`}
          >
            취소
          </a>
          <button
            type="submit"
            disabled={form.submitting}
            className="rounded-full bg-[var(--color-primary)] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {form.submitting ? '저장 중…' : postId ? '저장' : '등록'}
          </button>
        </div>
      </form>
    </section>
  )
}
