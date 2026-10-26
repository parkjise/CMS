'use client'

/**
 * 방문자 인증 TanStack Query 훅 (T-113) — 컴포넌트는 API 를 직접 부르지 않는다 (CLAUDE.md 4)
 */
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  checkEmail,
  checkResetToken,
  completeSocialSignup,
  fetchAuthOptions,
  findEmail,
  forgotPassword,
  login,
  register,
  resetPassword,
  sendPhoneCode,
  verifyPhoneCode,
  type MemberApiError,
  type RegisterInput,
  type SocialCompleteInput,
  type VerificationPurpose,
} from '@/lib/memberAuth'
import { useMemberStore } from '@/lib/memberStore'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'

export const memberKeys = {
  options: (slug: string) => ['member', slug, 'options'] as const,
  email: (slug: string, email: string) => ['member', slug, 'email', email] as const,
  resetToken: (slug: string, token: string) => ['member', slug, 'reset', token] as const,
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const useAuthOptions = (slug: string) =>
  useQuery({
    queryKey: memberKeys.options(slug),
    queryFn: () => fetchAuthOptions(slug),
    staleTime: 5 * 60_000,
  })

/** 이메일 중복 확인 — 입력이 1초 멈추면 조회 */
export const useEmailAvailability = (slug: string, email: string) => {
  const value = useDebouncedValue(email.trim().toLowerCase(), 1000)
  return useQuery({
    queryKey: memberKeys.email(slug, value),
    queryFn: () => checkEmail(slug, value),
    enabled: EMAIL_RE.test(value),
    staleTime: 30_000,
    retry: false,
  })
}

export const useLogin = (slug: string) => {
  const setSession = useMemberStore((s) => s.setSession)
  return useMutation<
    Awaited<ReturnType<typeof login>>,
    MemberApiError,
    { email: string; password: string; remember_me: boolean }
  >({
    mutationFn: (input) => login(slug, input),
    onSuccess: (session) => setSession(slug, session),
  })
}

export const useRegister = (slug: string) => {
  const setSession = useMemberStore((s) => s.setSession)
  return useMutation<Awaited<ReturnType<typeof register>>, MemberApiError, RegisterInput>({
    mutationFn: (input) => register(slug, input),
    onSuccess: (session) => setSession(slug, session),
  })
}

export const useSocialComplete = (slug: string) => {
  const setSession = useMemberStore((s) => s.setSession)
  return useMutation<
    Awaited<ReturnType<typeof completeSocialSignup>>,
    MemberApiError,
    SocialCompleteInput
  >({
    mutationFn: (input) => completeSocialSignup(slug, input),
    onSuccess: (session) => setSession(slug, session),
  })
}

export const useSendPhoneCode = (slug: string, purpose: VerificationPurpose) =>
  useMutation<Awaited<ReturnType<typeof sendPhoneCode>>, MemberApiError, string>({
    mutationFn: (phone) => sendPhoneCode(slug, phone, purpose),
  })

export const useVerifyPhoneCode = (slug: string) =>
  useMutation<
    Awaited<ReturnType<typeof verifyPhoneCode>>,
    MemberApiError,
    { verificationId: string; code: string }
  >({
    mutationFn: ({ verificationId, code }) => verifyPhoneCode(slug, verificationId, code),
  })

export const useFindEmail = (slug: string) =>
  useMutation<
    Awaited<ReturnType<typeof findEmail>>,
    MemberApiError,
    { name: string; verificationId: string }
  >({
    mutationFn: ({ name, verificationId }) => findEmail(slug, name, verificationId),
  })

export const useForgotPassword = (slug: string) =>
  useMutation<
    Awaited<ReturnType<typeof forgotPassword>>,
    MemberApiError,
    { email: string; verificationId: string }
  >({
    mutationFn: ({ email, verificationId }) => forgotPassword(slug, email, verificationId),
  })

export const useResetToken = (slug: string, token: string) =>
  useQuery({
    queryKey: memberKeys.resetToken(slug, token),
    queryFn: () => checkResetToken(slug, token),
    enabled: token.length > 0,
    retry: false,
  })

export const useResetPassword = (slug: string) =>
  useMutation<
    Awaited<ReturnType<typeof resetPassword>>,
    MemberApiError,
    { token: string; password: string; password_confirm: string }
  >({
    mutationFn: (input) => resetPassword(slug, input),
  })
