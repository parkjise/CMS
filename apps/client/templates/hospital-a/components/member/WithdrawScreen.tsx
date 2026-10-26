'use client'

/**
 * hospital-a 회원 탈퇴 — 목업 components/sub/withdraw-form.html 마크업 그대로 (T-124).
 * 로직은 공통 화면과 같은 훅(useWithdrawForm). 완료 화면은 로그인 확인 밖에서 그린다 (T-114 E2E 발견).
 */
import { useEffect, useState } from 'react'
import { useWithdrawForm } from '@/hooks/member/useMypage'
import type { WithdrawalReason } from '@/lib/memberAccount'
import { useMemberStore } from '@/lib/memberStore'
import { MemberSection, PasswordInput, Req, StatusLine } from './parts'

const REASONS: { value: WithdrawalReason; label: string }[] = [
  { value: 'INCONVENIENT', label: '서비스 이용이 불편해요' },
  { value: 'PRIVACY', label: '개인정보가 걱정돼요' },
  { value: 'NOT_USING', label: '더 이상 이용하지 않아요' },
  { value: 'OTHER', label: '기타' },
]

export const WithdrawDoneScreen = ({ slug, brandName }: { slug: string; brandName: string }) => (
  <MemberSection labelledBy="withdraw-title">
    <div className="board-form__panel board-form__panel--narrow member-form__done" role="status">
      <i className="ri-hand-heart-line member-form__done-icon member-form__done-icon--muted" aria-hidden="true" />
      <h2 className="member-form__title" id="withdraw-title">
        탈퇴가 완료되었어요
      </h2>
      <p className="member-form__desc">
        그동안 {brandName}를 이용해 주셔서 감사합니다.
        <br />
        탈퇴 안내는 문자와 이메일로 보내드렸어요.
      </p>
      <div className="member-form__buttons">
        <a className="member-form__submit" href={`/${slug}`}>
          홈으로
        </a>
      </div>
    </div>
  </MemberSection>
)

export const WithdrawScreen = ({ slug, onDone }: { slug: string; onDone: () => void }) => {
  const w = useWithdrawForm(slug, onDone)
  const [agree, setAgree] = useState(false)
  const [agreeError, setAgreeError] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setAgreeError(null)
    if (!agree) {
      setAgreeError('안내 사항 확인에 동의해 주세요.')
      return
    }
    w.submit()
  }

  if (!w.loaded) return null
  return (
    <MemberSection labelledBy="withdraw-title">
      <form className="board-form__form" noValidate onSubmit={submit}>
        <div className="board-form__panel board-form__panel--narrow">
          <h2 className="member-form__heading" id="withdraw-title">
            회원 탈퇴
          </h2>

          <div className="member-form__warning">
            <p className="member-form__warning-title">
              <i className="ri-error-warning-fill" aria-hidden="true" />
              탈퇴 전 확인해 주세요.
            </p>
            <p>탈퇴하면 아래 데이터가 삭제되며 다시 되돌릴 수 없어요.</p>
            <ul className="member-form__bullets">
              <li>예약 내역 전체</li>
              <li>문의 내역 전체</li>
              <li>알림 설정 전체</li>
            </ul>
            <p>진행 중인 예약(대기 · 확정)이 있으면 탈퇴할 수 없어요.</p>
          </div>

          {w.blocked && (
            <div className="member-form__block">
              <p className="member-form__block-title">진행 중인 예약이 있어요.</p>
              <p>예약을 취소하거나 이용을 마친 뒤 탈퇴할 수 있어요.</p>
              <a className="member-form__line-link" href={`/${slug}/member/mypage?tab=reservations`}>
                내 예약 보기
              </a>
            </div>
          )}

          <div className="board-form__list">
            <div className="board-form__row">
              <label className="board-form__label" htmlFor="wd-reason">
                탈퇴 사유 <span className="member-form__optional">(선택)</span>
              </label>
              <div className="board-form__field board-form__field--select">
                <select
                  className="board-form__input board-form__select"
                  id="wd-reason"
                  value={w.reason}
                  onChange={(e) => w.setReason(e.target.value as WithdrawalReason | '')}
                >
                  <option value="">사유를 선택해 주세요</option>
                  {REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <i className="ri-arrow-down-s-line" aria-hidden="true" />
              </div>
              {w.reason === 'OTHER' && (
                <>
                  <label className="sr-only" htmlFor="wd-reason-etc">
                    기타 사유
                  </label>
                  <textarea
                    className="board-form__input board-form__textarea member-form__reason-etc"
                    id="wd-reason-etc"
                    maxLength={200}
                    placeholder="불편했던 점을 알려주시면 서비스 개선에 참고할게요. (200자 이내)"
                    value={w.detail}
                    onChange={(e) => w.setDetail(e.target.value)}
                  />
                </>
              )}
            </div>

            {w.needsPassword && (
              <div className="board-form__row">
                <label className="board-form__label" htmlFor="wd-pw">
                  비밀번호 확인<Req />
                </label>
                <PasswordInput
                  id="wd-pw"
                  placeholder="현재 비밀번호를 입력해 주세요."
                  autoComplete="current-password"
                  aria-describedby="wd-pw-help"
                  value={w.password}
                  onChange={(e) => w.setPassword(e.target.value)}
                />
                <p className="board-form__help" id="wd-pw-help">
                  카카오 · 네이버로 가입한 경우 비밀번호 확인 없이 탈퇴할 수 있어요.
                </p>
              </div>
            )}

            <div className="board-form__row board-form__row--check">
              <input
                className="board-form__checkbox"
                type="checkbox"
                id="wd-agree"
                checked={agree}
                aria-invalid={agreeError ? true : undefined}
                onChange={(e) => setAgree(e.target.checked)}
              />
              <label className="board-form__check" htmlFor="wd-agree">
                안내 사항을 모두 확인했으며 탈퇴에 동의합니다.
              </label>
            </div>
          </div>

          <StatusLine message={agreeError ?? w.error} />

          <div className="board-form__actions member-form__actions">
            <a className="board-form__cancel" href={`/${slug}/member/mypage?tab=profile`}>
              취소
            </a>
            <button className="board-form__submit member-form__danger" type="submit" disabled={w.pending}>
              탈퇴하기
            </button>
          </div>
        </div>
      </form>
    </MemberSection>
  )
}

/** 완료 화면으로 바뀐 뒤 세션을 비운다 (자동 로그아웃) */
export const useWithdrawFlow = () => {
  const [done, setDone] = useState(false)
  const clear = useMemberStore((s) => s.clear)
  useEffect(() => {
    if (done) clear()
  }, [done, clear])
  return { done, finish: () => setDone(true) }
}
