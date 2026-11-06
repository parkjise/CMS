'use client'

import { memberLoginHref } from '@/components/board/useMemberBoard'

interface BoardGateProps {
  title: string
  tenantSlug: string
  /** checking 은 확인 중, login 은 로그인 안내, closed 는 회원 기능이 꺼진 사업체 */
  kind: 'checking' | 'login' | 'closed'
  text: string
}

/** 회원 게시판 · 회원 글쓰기의 로그인 안내 (T-150) */
export function BoardGate({ title, tenantSlug, kind, text }: BoardGateProps) {
  return (
    <section className="board-list" aria-labelledby="board-gate-title">
      <div className="page-container">
        <h2 className="board-list__title" id="board-gate-title">
          {title}
        </h2>
        <div className="board-gate" aria-live="polite">
          {kind === 'checking' ? (
            <p className="board-gate__text">로그인 정보를 확인하고 있습니다…</p>
          ) : (
            <>
              <i className="ri-lock-line board-gate__icon" aria-hidden="true" />
              <p className="board-gate__text">{text}</p>
              {kind === 'login' ? (
                <a className="board-gate__button" href={memberLoginHref(tenantSlug)}>
                  로그인
                </a>
              ) : (
                <p className="board-gate__hint">지금은 볼 수 없습니다.</p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
