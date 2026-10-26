'use client'

import Link from 'next/link'
import { useProfileEditor, type ProfileField } from '@/hooks/member/useMypage'
import type { MemberProfile } from '@/lib/memberAccount'
import { formatDay } from '@/lib/memberFormat'
import { FormError, TextInput, secondaryButtonClass } from '../fields'
import PhoneVerification from '../PhoneVerification'
import PasswordChange from './PasswordChange'
import SocialLinks from './SocialLinks'


const Row = ({ label, value, action }: { label: string; value: React.ReactNode; action?: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3 py-3 text-sm">
    <span className="w-20 shrink-0 text-[color:var(--color-text-muted)]">{label}</span>
    <span className="flex-1 text-[color:var(--color-text-primary)]">{value}</span>
    {action}
  </div>
)

/** 내 정보 탭 (기획서 16.7) — 이름 · 연락처 · 생년월일 수정, 비밀번호, 소셜 연결 */
const ProfileTab = ({ slug }: { slug: string }) => {
  const editor = useProfileEditor(slug)
  const { editing, draft, setDraft, phoneVerificationId, setPhoneVerificationId, error, notice } =
    editor
  if (!editor.profile) return <FormError message={editor.loadError} />
  const profile: MemberProfile = editor.profile
  const startEdit = editor.start
  const save = editor.save

  const editButton = (field: ProfileField, label = '수정') =>
    editing === field ? null : (
      <button type="button" className="text-xs font-medium text-[color:var(--color-primary)]" onClick={() => startEdit(field)}>
        {label}
      </button>
    )

  const editBox =
    editing && editing !== 'password' ? (
      <div className="space-y-2 rounded-md bg-[var(--color-surface)] p-4">
        {editing === 'phone' ? (
          <PhoneVerification
            slug={slug}
            purpose="MYPAGE"
            phone={draft}
            onPhoneChange={setDraft}
            verified={Boolean(phoneVerificationId)}
            onVerified={setPhoneVerificationId}
            onReset={() => setPhoneVerificationId('')}
          />
        ) : (
          <TextInput
            id={`edit-${editing}`}
            aria-label={editing === 'name' ? '새 이름' : '생년월일'}
            type={editing === 'birth_date' ? 'date' : 'text'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        )}
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButtonClass} onClick={editor.cancel}>
            취소
          </button>
          <button
            type="button"
            className="rounded-md bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-[color:var(--color-on-primary)] disabled:opacity-60"
            disabled={editor.saving}
            onClick={save}
          >
            저장
          </button>
        </div>
      </div>
    ) : null

  return (
    <section className="space-y-4">
      <div className="divide-y divide-[color:var(--color-border)]">
        <Row label="이름" value={profile.name} action={editButton('name')} />
        {editing === 'name' && editBox}
        <Row label="이메일" value={<>{profile.email} <span className="text-xs text-[color:var(--color-text-subtle)]">(변경불가)</span></>} />
        <Row label="연락처" value={profile.phone ?? '-'} action={editButton('phone')} />
        {editing === 'phone' && editBox}
        <Row label="생년월일" value={profile.birth_date ?? '-'} action={editButton('birth_date')} />
        {editing === 'birth_date' && editBox}
        <Row label="가입일" value={formatDay(profile.created_at)} />
        <Row
          label="비밀번호"
          value={profile.has_password ? '••••••••' : '설정되지 않음'}
          action={editButton('password', profile.has_password ? '변경' : '설정')}
        />
      </div>
      {editing === 'password' && (
        <PasswordChange
          slug={slug}
          hasPassword={profile.has_password}
          phone={profile.phone}
          onDone={editor.passwordChanged}
        />
      )}
      {notice && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </p>
      )}

      <SocialLinks slug={slug} returnTo={`/${slug}/member/mypage?tab=profile`} />

      <div className="border-t border-[color:var(--color-border)] pt-4">
        <Link
          href={`/${slug}/member/withdraw`}
          className="block w-full rounded-md border border-[color:var(--color-border)] py-3 text-center text-sm text-[color:var(--color-text-muted)]"
        >
          회원 탈퇴
        </Link>
      </div>
    </section>
  )
}

export default ProfileTab
