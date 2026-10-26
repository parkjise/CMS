'use client'

/**
 * hospital-a 마이페이지 — 목업 components/sub/mypage.html 마크업 그대로 (T-124).
 * 로직은 공통 화면과 같은 훅(hooks/member/useMypage · useMemberAccount).
 */
import { useState } from 'react'
import { useAuthOptions } from '@/hooks/member/useMemberAuth'
import {
  useInquiries,
  useInquiryDetail,
  useLinkSocial,
  useMe,
  useNotifications,
  useSocialAccounts,
  useUnlinkSocial,
  useUpdateNotification,
} from '@/hooks/member/useMemberAccount'
import {
  NOTIFICATION_ITEMS,
  RESERVATION_MONTHS,
  describeReservation,
  useMypageView,
  usePasswordChangeForm,
  useProfileEditor,
  useReservationList,
  type MypageTab,
  type ProfileField,
} from '@/hooks/member/useMypage'
import type { MemberReservation, ReservationStatus } from '@/lib/memberAccount'
import { formatDay } from '@/lib/memberFormat'
import { providerLabel, type SocialProvider } from '@/lib/memberSocial'
import { PasswordInput, PasswordRules, PhoneVerify, Req, StatusLine, firstError } from './parts'

// 목업 배지 문구 (기획서 16.7 상태 4종)
const BADGES: Record<ReservationStatus, { label: string; modifier: string }> = {
  PENDING: { label: '대기중', modifier: 'pending' },
  CONFIRMED: { label: '예약 확정', modifier: 'confirmed' },
  COMPLETED: { label: '이용 완료', modifier: 'completed' },
  CANCELLED: { label: '예약 취소', modifier: 'cancelled' },
}
const FILTER_LABELS: Record<ReservationStatus, string> = {
  PENDING: '대기중',
  CONFIRMED: '확정',
  COMPLETED: '완료',
  CANCELLED: '취소',
}
const TAB_IDS: Record<MypageTab, string> = {
  reservations: 'reservations',
  inquiries: 'inquiries',
  notifications: 'notifications',
  profile: 'info',
}

interface MypageScreenProps {
  slug: string
  brandName: string
}

export const MypageScreen = ({ slug, brandName }: MypageScreenProps) => {
  const view = useMypageView(slug)
  const me = useMe(slug)
  if (!view.ready) return null

  return (
    <section className="mypage" aria-labelledby="mypage-title">
      <div className="page-container">
        <div className="mypage__head">
          <div>
            <h2 className="mypage__hello" id="mypage-title">
              안녕하세요, <strong>{view.memberName}</strong> 님
            </h2>
            {me.data && (
              <p className="mypage__since">
                {brandName} 회원 · {formatDay(me.data.created_at)} 가입
              </p>
            )}
          </div>
          <a
            className="mypage__logout"
            href={`/${slug}`}
            onClick={(e) => {
              e.preventDefault()
              void view.signOut()
            }}
          >
            <i className="ri-logout-box-r-line" aria-hidden="true" />
            로그아웃
          </a>
        </div>

        {view.linkedNotice && (
          <p className="mypage__status" role="status">
            {view.linkedNotice}
          </p>
        )}

        <div className="mypage__tabs" role="tablist" aria-label="마이페이지 메뉴">
          {view.tabs.map((tab) => (
            <button
              key={tab.key}
              className="mypage__tab"
              type="button"
              role="tab"
              id={`mp-tab-${TAB_IDS[tab.key]}`}
              aria-controls={TAB_IDS[tab.key]}
              aria-selected={view.active === tab.key}
              tabIndex={view.active === tab.key ? 0 : -1}
              onClick={() => view.select(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div
          className="mypage__panel"
          role="tabpanel"
          id={TAB_IDS[view.active]}
          aria-labelledby={`mp-tab-${TAB_IDS[view.active]}`}
          tabIndex={0}
        >
          {view.active === 'reservations' && <ReservationsPanel slug={slug} />}
          {view.active === 'inquiries' && <InquiriesPanel slug={slug} />}
          {view.active === 'notifications' && (
            <NotificationsPanel slug={slug} reservations={view.reservations} />
          )}
          {view.active === 'profile' && <InfoPanel slug={slug} />}
        </div>
      </div>
    </section>
  )
}

// ── 내 예약 ─────────────────────────────────────────────────────────────────

const ReservationItem = ({
  reservation,
  onCancel,
  cancelling,
}: {
  reservation: MemberReservation
  onCancel: (id: string) => void
  cancelling: boolean
}) => {
  const [confirming, setConfirming] = useState(false)
  const view = describeReservation(reservation)
  const badge = BADGES[reservation.status]
  return (
    <li className="mypage__card" data-status={reservation.status.toLowerCase()}>
      <span className={`mypage__badge mypage__badge--${badge.modifier}`}>{badge.label}</span>
      {view.title && (
        <p className="mypage__card-title">
          {reservation.reserved_at && reservation.reservation_type !== 'GENERAL' ? (
            <time dateTime={reservation.reserved_at}>{view.title}</time>
          ) : (
            view.title
          )}
        </p>
      )}
      {view.when && (
        <p className="mypage__card-meta">
          <time dateTime={reservation.reserved_at ?? undefined}>{view.when}</time>
        </p>
      )}
      {view.meta && <p className="mypage__card-meta">{view.meta}</p>}
      {view.amount && <p className="mypage__card-meta">{view.amount}</p>}
      {view.cancellable && (
        <div className="mypage__card-actions">
          {confirming ? (
            <>
              <button className="mypage__action" type="button" onClick={() => setConfirming(false)}>
                아니요
              </button>
              <button
                className="mypage__action"
                type="button"
                disabled={cancelling}
                onClick={() => onCancel(reservation.id)}
              >
                취소 확정
              </button>
            </>
          ) : (
            <button className="mypage__action" type="button" onClick={() => setConfirming(true)}>
              예약 취소
            </button>
          )}
        </div>
      )}
    </li>
  )
}

const ReservationsPanel = ({ slug }: { slug: string }) => {
  const list = useReservationList(slug)
  return (
    <>
      <div className="mypage__panel-head">
        <h3 className="mypage__panel-title">내 예약 내역</h3>
        <div className="mypage__filters">
          <div className="board-form__field board-form__field--select">
            <label className="sr-only" htmlFor="mp-status">
              예약 상태
            </label>
            <select
              className="board-form__input board-form__select mypage__select"
              id="mp-status"
              value={list.status ?? ''}
              onChange={(e) => list.setStatus((e.target.value || null) as ReservationStatus | null)}
            >
              <option value="">전체 상태</option>
              {(Object.keys(FILTER_LABELS) as ReservationStatus[]).map((key) => (
                <option key={key} value={key}>
                  {FILTER_LABELS[key]}
                </option>
              ))}
            </select>
            <i className="ri-arrow-down-s-line" aria-hidden="true" />
          </div>
          <div className="board-form__field board-form__field--select">
            <label className="sr-only" htmlFor="mp-period">
              조회 기간
            </label>
            <select
              className="board-form__input board-form__select mypage__select"
              id="mp-period"
              value={list.months}
              onChange={(e) => list.setMonths(Number(e.target.value))}
            >
              {RESERVATION_MONTHS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <i className="ri-arrow-down-s-line" aria-hidden="true" />
          </div>
        </div>
      </div>

      {!list.loading && list.items.length > 0 && (
        <ul className="mypage__cards">
          {list.items.map((reservation) => (
            <ReservationItem
              key={reservation.id}
              reservation={reservation}
              onCancel={list.cancel}
              cancelling={list.cancelling}
            />
          ))}
        </ul>
      )}
      {!list.loading && list.items.length === 0 && <p className="mypage__empty">조건에 맞는 예약이 없어요.</p>}

      <dl className="mypage__legend" aria-label="예약 상태 안내">
        <div>
          <dt>
            <span className="mypage__dot mypage__dot--pending" aria-hidden="true" />
            대기중
          </dt>
          <dd>예약을 확인하고 있어요</dd>
        </div>
        <div>
          <dt>
            <span className="mypage__dot mypage__dot--confirmed" aria-hidden="true" />
            확정
          </dt>
          <dd>방문일에 뵐게요</dd>
        </div>
        <div>
          <dt>
            <span className="mypage__dot mypage__dot--completed" aria-hidden="true" />
            완료
          </dt>
          <dd>이용을 마쳤어요</dd>
        </div>
        <div>
          <dt>
            <span className="mypage__dot mypage__dot--cancelled" aria-hidden="true" />
            취소
          </dt>
          <dd>취소된 예약이에요</dd>
        </div>
      </dl>
      <p className={`mypage__status${list.error ? ' mypage__status--error' : ''}`} role="status" aria-live="polite">
        {list.error}
      </p>
      <div className="mypage__more">
        <a className="member-form__line-link" href={`/${slug}/reservation`}>
          새 예약하기
        </a>
      </div>
    </>
  )
}

// ── 문의 내역 ───────────────────────────────────────────────────────────────

const InquiryDetail = ({ slug, id }: { slug: string; id: string }) => {
  const detail = useInquiryDetail(slug, id)
  if (!detail.data) return null
  return (
    <div className="mypage__card-meta">
      <p>{detail.data.message}</p>
      <p>
        <strong>답변</strong> {detail.data.answer ?? '아직 답변이 등록되지 않았습니다.'}
      </p>
    </div>
  )
}

const InquiriesPanel = ({ slug }: { slug: string }) => {
  const inquiries = useInquiries(slug)
  const [openId, setOpenId] = useState<string | null>(null)
  const items = inquiries.data?.items ?? []
  return (
    <>
      <div className="mypage__panel-head">
        <h3 className="mypage__panel-title">문의 내역</h3>
      </div>
      {items.length > 0 ? (
        <ul className="mypage__cards">
          {items.map((inquiry) => (
            <li key={inquiry.id} className="mypage__card">
              <span className={`mypage__badge mypage__badge--${inquiry.answered ? 'done' : 'pending'}`}>
                {inquiry.answered ? '답변 완료' : '답변 대기'}
              </span>
              <p className="mypage__card-title">{inquiry.subject ?? '문의'}</p>
              <p className="mypage__card-meta">
                <time dateTime={inquiry.created_at}>{formatDay(inquiry.created_at)}</time> 접수
              </p>
              {openId === inquiry.id && <InquiryDetail slug={slug} id={inquiry.id} />}
              <div className="mypage__card-actions">
                <button
                  className="mypage__action"
                  type="button"
                  aria-expanded={openId === inquiry.id}
                  onClick={() => setOpenId(openId === inquiry.id ? null : inquiry.id)}
                >
                  {openId === inquiry.id ? '닫기' : '상세보기'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        !inquiries.isLoading && <p className="mypage__empty">문의 내역이 없어요.</p>
      )}
      <div className="mypage__more">
        <a className="member-form__line-link" href={`/${slug}/consult/write`}>
          새 문의 남기기
        </a>
      </div>
    </>
  )
}

// ── 알림 설정 ───────────────────────────────────────────────────────────────

const NotificationsPanel = ({ slug, reservations }: { slug: string; reservations: boolean }) => {
  const settings = useNotifications(slug)
  const update = useUpdateNotification(slug)
  const data = settings.data
  return (
    <>
      <div className="mypage__panel-head">
        <h3 className="mypage__panel-title">알림 설정</h3>
      </div>
      {data && (
        <ul className="mypage__settings">
          {NOTIFICATION_ITEMS.filter((item) => reservations || !('reservation' in item)).map((item) => (
            <li key={item.key} className="mypage__setting">
              <label className="mypage__setting-label" htmlFor={`nt-${item.key}`}>
                {item.label}
                <span>{item.help}</span>
              </label>
              <input
                className="mypage__switch"
                type="checkbox"
                role="switch"
                id={`nt-${item.key}`}
                checked={data[item.key]}
                onChange={() => update.mutate({ [item.key]: !data[item.key] })}
              />
            </li>
          ))}
        </ul>
      )}
      <p className={`mypage__status${update.error ? ' mypage__status--error' : ''}`} role="status" aria-live="polite">
        {update.error ? `저장하지 못했습니다. ${update.error.message}` : update.isSuccess ? '저장되었습니다.' : null}
      </p>
    </>
  )
}

// ── 내 정보 ─────────────────────────────────────────────────────────────────

const InfoPanel = ({ slug }: { slug: string }) => {
  const editor = useProfileEditor(slug)
  const options = useAuthOptions(slug)
  const accounts = useSocialAccounts(slug)
  const link = useLinkSocial(slug)
  const unlink = useUnlinkSocial(slug)
  const profile = editor.profile
  if (!profile) return null

  const editRow = (field: Exclude<ProfileField, 'password'>, label: string, value: string | null) => {
    const editing = editor.editing === field
    return (
      <div className="mypage__info-row">
        <dt>{label}</dt>
        <dd>
          {!editing && <span className="mypage__info-value">{value ?? '-'}</span>}
          {editing && field !== 'phone' && (
            <>
              <label className="sr-only" htmlFor={`mi-${field}`}>
                {label}
              </label>
              <input
                className="board-form__input mypage__info-input"
                type={field === 'birth_date' ? 'date' : 'text'}
                id={`mi-${field}`}
                value={editor.draft}
                onChange={(e) => editor.setDraft(e.target.value)}
              />
            </>
          )}
          {editing && field === 'phone' && (
            <PhoneVerify
              id="mi"
              slug={slug}
              purpose="MYPAGE"
              phone={editor.draft}
              onPhoneChange={editor.setDraft}
              verified={Boolean(editor.phoneVerificationId)}
              onVerified={editor.setPhoneVerificationId}
              onReset={() => editor.setPhoneVerificationId('')}
            />
          )}
        </dd>
        <dd className="mypage__info-actions">
          {editing ? (
            <>
              <button className="mypage__action" type="button" onClick={editor.cancel}>
                취소
              </button>
              <button className="mypage__action" type="button" disabled={editor.saving} onClick={editor.save}>
                저장
              </button>
            </>
          ) : (
            <button className="mypage__action" type="button" onClick={() => editor.start(field)}>
              수정
            </button>
          )}
        </dd>
      </div>
    )
  }

  const linked = new Set(accounts.data?.accounts.map((a) => a.provider))
  const socialError = link.error?.message ?? unlink.error?.message ?? null
  const providers: SocialProvider[] = options.data?.social_login ? options.data.providers : []

  return (
    <>
      <div className="mypage__panel-head">
        <h3 className="mypage__panel-title">내 정보</h3>
      </div>
      <dl className="mypage__info">
        {editRow('name', '이름', profile.name)}
        <div className="mypage__info-row">
          <dt>이메일</dt>
          <dd>
            <span className="mypage__info-value">{profile.email}</span>{' '}
            <span className="mypage__info-note">(변경 불가)</span>
          </dd>
        </div>
        {editRow('phone', '연락처', profile.phone)}
        {editRow('birth_date', '생년월일', profile.birth_date)}
        <div className="mypage__info-row">
          <dt>가입일</dt>
          <dd>
            <span className="mypage__info-value">{formatDay(profile.created_at)}</span>
          </dd>
        </div>
      </dl>
      <p
        className={`mypage__status${editor.error ? ' mypage__status--error' : ''}`}
        role="status"
        aria-live="polite"
      >
        {editor.error ?? editor.notice}
      </p>

      <div className="mypage__block">
        <div className="mypage__block-head">
          <h4 className="mypage__block-title">비밀번호 {profile.has_password ? '변경' : '설정'}</h4>
          <button
            className="mypage__action"
            type="button"
            aria-expanded={editor.editing === 'password'}
            aria-controls="mp-password"
            onClick={() => (editor.editing === 'password' ? editor.cancel() : editor.start('password'))}
          >
            {profile.has_password ? '변경' : '설정'}
          </button>
        </div>
        {editor.editing === 'password' && (
          <PasswordForm slug={slug} hasPassword={profile.has_password} phone={profile.phone} onDone={editor.passwordChanged} />
        )}
      </div>

      {providers.length > 0 && (
        <div className="mypage__block">
          <h4 className="mypage__block-title">연결된 소셜 계정</h4>
          <ul className="mypage__social">
            {providers.map((provider) => {
              const on = linked.has(provider)
              return (
                <li key={provider} className={`mypage__social-item${on ? ' mypage__social-item--on' : ''}`}>
                  {provider === 'KAKAO' ? (
                    <span className="member-form__sns-icon member-form__sns-icon--kakao-badge" aria-hidden="true">
                      <i className="ri-kakao-talk-fill" />
                    </span>
                  ) : (
                    <span className="member-form__sns-icon member-form__sns-icon--naver" aria-hidden="true">
                      N
                    </span>
                  )}
                  <span className="mypage__social-name">{providerLabel(provider)}</span>
                  <span className="mypage__social-state">{on ? '연결됨' : '미연결'}</span>
                  <button
                    className="mypage__action"
                    type="button"
                    aria-pressed={on}
                    aria-label={`${providerLabel(provider)} ${on ? '연결 해제' : '연결하기'}`}
                    disabled={link.isPending || unlink.isPending}
                    onClick={() =>
                      on
                        ? unlink.mutate(provider)
                        : link.mutate(
                            { provider, returnTo: `/${slug}/member/mypage?tab=profile` },
                            { onSuccess: (r) => window.location.assign(r.authorize_url) },
                          )
                    }
                  >
                    {on ? '연결 해제' : '연결하기'}
                  </button>
                </li>
              )
            })}
          </ul>
          <p className={`mypage__status${socialError ? ' mypage__status--error' : ''}`} role="status" aria-live="polite">
            {socialError}
          </p>
        </div>
      )}

      <div className="mypage__withdraw">
        <a href={`/${slug}/member/withdraw`}>회원 탈퇴</a>
      </div>
    </>
  )
}

const PasswordForm = ({
  slug,
  hasPassword,
  phone,
  onDone,
}: {
  slug: string
  hasPassword: boolean
  phone: string | null
  onDone: () => void
}) => {
  const change = usePasswordChangeForm(slug, hasPassword, onDone)
  const {
    register,
    formState: { errors },
  } = change.form
  const status = firstError(errors, ['current_password', 'password', 'password_confirm']) ?? change.formError
  return (
    <form className="board-form__form mypage__password" id="mp-password" noValidate onSubmit={change.onSubmit}>
      <div className="board-form__list">
        {hasPassword ? (
          <div className="board-form__row">
            <label className="board-form__label" htmlFor="mp-pw-now">
              현재 비밀번호<Req />
            </label>
            <input
              className="board-form__input"
              type="password"
              id="mp-pw-now"
              autoComplete="current-password"
              aria-invalid={errors.current_password ? true : undefined}
              {...register('current_password')}
            />
          </div>
        ) : (
          <PhoneVerify
            id="mp"
            slug={slug}
            purpose="MYPAGE"
            phone={phone ?? ''}
            onPhoneChange={() => undefined}
            verified={Boolean(change.verificationId)}
            onVerified={change.setVerificationId}
            onReset={() => change.setVerificationId('')}
          />
        )}
        <div className="board-form__row">
          <label className="board-form__label" htmlFor="mp-pw">
            새 비밀번호<Req />
          </label>
          <PasswordInput
            id="mp-pw"
            placeholder="영문, 숫자 포함 8자 이상"
            autoComplete="new-password"
            maxLength={20}
            aria-describedby="mp-pw-rules"
            invalid={Boolean(errors.password)}
            {...register('password')}
          />
          <PasswordRules id="mp-pw" value={change.password} />
        </div>
        <div className="board-form__row">
          <label className="board-form__label" htmlFor="mp-pw2">
            새 비밀번호 확인<Req />
          </label>
          <input
            className="board-form__input"
            type="password"
            id="mp-pw2"
            autoComplete="new-password"
            maxLength={20}
            aria-invalid={errors.password_confirm ? true : undefined}
            {...register('password_confirm')}
          />
        </div>
      </div>
      <StatusLine message={status} />
      <div className="board-form__actions mypage__password-actions">
        <button className="board-form__submit" type="submit" disabled={change.pending}>
          변경하기
        </button>
      </div>
    </form>
  )
}
