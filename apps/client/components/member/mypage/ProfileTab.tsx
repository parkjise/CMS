'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMe, useUpdateMe } from '@/hooks/member/useMemberAccount'
import type { MemberProfile } from '@/lib/memberAccount'
import { formatDay } from '@/lib/memberFormat'
import { MESSAGES } from '@/lib/memberSchemas'
import { FormError, TextInput, secondaryButtonClass } from '../fields'
import PhoneVerification from '../PhoneVerification'
import PasswordChange from './PasswordChange'
import SocialLinks from './SocialLinks'

type Editing = 'name' | 'phone' | 'birth_date' | 'password' | null

const NAME_RE = /^[가-힣a-zA-Z ]{2,100}$/

const Row = ({ label, value, action }: { label: string; value: React.ReactNode; action?: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3 py-3 text-sm">
    <span className="w-20 shrink-0 text-[color:var(--color-text-muted)]">{label}</span>
    <span className="flex-1 text-[color:var(--color-text-primary)]">{value}</span>
    {action}
  </div>
)

/** 내 정보 탭 (기획서 16.7) — 이름 · 연락처 · 생년월일 수정, 비밀번호, 소셜 연결 */
const ProfileTab = ({ slug }: { slug: string }) => {
  const me = useMe(slug)
  const update = useUpdateMe(slug)
  const [editing, setEditing] = useState<Editing>(null)
  const [draft, setDraft] = useState('')
  const [phoneVerificationId, setPhoneVerificationId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (!me.data) return <FormError message={me.error?.message} />
  const profile: MemberProfile = me.data

  const startEdit = (field: Exclude<Editing, null>) => {
    setError(null)
    setNotice(null)
    setEditing(field)
    setPhoneVerificationId('')
    setDraft(field === 'name' ? profile.name : field === 'phone' ? '' : (profile.birth_date ?? ''))
  }

  const save = () => {
    setError(null)
    if (editing === 'name' && !NAME_RE.test(draft.trim())) return setError(MESSAGES.name)
    if (editing === 'phone' && !phoneVerificationId) return setError(MESSAGES.phoneVerified)
    const patch =
      editing === 'name'
        ? { name: draft.trim() }
        : editing === 'phone'
          ? { phone: draft.trim(), phone_verification_id: phoneVerificationId }
          : { birth_date: draft || null }
    update.mutate(patch, {
      onSuccess: () => {
        setEditing(null)
        setNotice('저장되었습니다.')
      },
      onError: (err) => setError(err.message),
    })
  }

  const editButton = (field: Exclude<Editing, null>, label = '수정') =>
    editing === field ? null : (
      <button type="button" className="text-xs font-medium text-[color:var(--color-primary)]" onClick={() => startEdit(field)}>
        {label}
      </button>
    )

  const editor =
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
          <button type="button" className={secondaryButtonClass} onClick={() => setEditing(null)}>
            취소
          </button>
          <button
            type="button"
            className="rounded-md bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-[color:var(--color-on-primary)] disabled:opacity-60"
            disabled={update.isPending}
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
        {editing === 'name' && editor}
        <Row label="이메일" value={<>{profile.email} <span className="text-xs text-[color:var(--color-text-subtle)]">(변경불가)</span></>} />
        <Row label="연락처" value={profile.phone ?? '-'} action={editButton('phone')} />
        {editing === 'phone' && editor}
        <Row label="생년월일" value={profile.birth_date ?? '-'} action={editButton('birth_date')} />
        {editing === 'birth_date' && editor}
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
          onDone={() => {
            setEditing(null)
            setNotice('비밀번호가 변경되었습니다. 다른 기기에서는 다시 로그인해야 합니다.')
          }}
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
