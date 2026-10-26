'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useFindEmail } from '@/hooks/member/useMemberAuth'
import type { FoundAccount } from '@/lib/memberAuth'
import { findEmailSchema, type FindEmailValues } from '@/lib/memberSchemas'
import { providerLabel } from '@/lib/memberSocial'
import { Field, FormError, TextInput, primaryButtonClass, secondaryButtonClass } from './fields'
import PhoneVerification from './PhoneVerification'

interface FindEmailFormProps {
  slug: string
}

/** 이메일 찾기 (기획서 16.5) — 이름 + 휴대폰 인증 → 가린 이메일 */
const FindEmailForm = ({ slug }: FindEmailFormProps) => {
  const find = useFindEmail(slug)
  const [accounts, setAccounts] = useState<FoundAccount[] | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    clearErrors,
    formState: { errors },
  } = useForm<FindEmailValues>({
    resolver: zodResolver(findEmailSchema),
    defaultValues: { name: '', phone: '', phone_verification_id: '' },
  })
  const phone = watch('phone')
  const verificationId = watch('phone_verification_id')

  const onSubmit = (values: FindEmailValues) => {
    setFormError(null)
    setNotFound(false)
    find.mutate(
      { name: values.name.trim(), verificationId: values.phone_verification_id },
      {
        onSuccess: (result) => setAccounts(result.accounts),
        onError: (error) =>
          error.status === 404 ? setNotFound(true) : setFormError(error.message),
      },
    )
  }

  if (accounts) {
    return (
      <div className="space-y-4">
        <p className="text-center font-semibold text-[color:var(--color-text-primary)]">
          ✓ 이메일을 찾았어요
        </p>
        <ul className="space-y-2 rounded-md bg-[var(--color-surface)] p-4">
          {accounts.map((account) => (
            <li key={account.masked_email} className="text-center">
              <span className="font-medium text-[color:var(--color-text-primary)]">
                {account.masked_email}
              </span>
              {account.social_provider && (
                <span className="ml-2 text-xs text-[color:var(--color-text-muted)]">
                  ({providerLabel(account.social_provider)} 가입)
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="text-center text-xs text-[color:var(--color-text-muted)]">
          (보안을 위해 일부만 표시합니다)
        </p>
        <Link href={`/${slug}/member/login`} className={`block text-center ${primaryButtonClass}`}>
          로그인하기
        </Link>
        <Link
          href={`/${slug}/member/find-password`}
          className={`block w-full text-center ${secondaryButtonClass}`}
        >
          비밀번호도 찾기
        </Link>
      </div>
    )
  }

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Field id="name" label="이름" required error={errors.name?.message}>
        <TextInput id="name" autoComplete="name" placeholder="홍길동"
          invalid={Boolean(errors.name)} {...register('name')} />
      </Field>
      <PhoneVerification
        slug={slug}
        purpose="FIND_EMAIL"
        phone={phone}
        onPhoneChange={(value) => setValue('phone', value)}
        verified={Boolean(verificationId)}
        onVerified={(id) => {
          setValue('phone_verification_id', id)
          clearErrors(['phone', 'phone_verification_id'])
        }}
        onReset={() => setValue('phone_verification_id', '')}
        phoneError={errors.phone?.message}
        verifyError={errors.phone_verification_id?.message}
      />
      {notFound && (
        <div role="alert" className="space-y-2 rounded-md bg-[var(--color-surface)] p-3 text-center text-sm">
          <p>입력하신 정보와 일치하는 계정을 찾을 수 없습니다.</p>
          <Link href={`/${slug}/member/join`} className="font-semibold text-[color:var(--color-primary)]">
            회원가입 하기
          </Link>
        </div>
      )}
      <FormError message={formError} />
      <button type="submit" className={primaryButtonClass} disabled={find.isPending}>
        이메일 찾기
      </button>
      <Link href={`/${slug}/member/login`} className="block text-center text-sm text-[color:var(--color-text-muted)]">
        ← 로그인으로 돌아가기
      </Link>
    </form>
  )
}

export default FindEmailForm
