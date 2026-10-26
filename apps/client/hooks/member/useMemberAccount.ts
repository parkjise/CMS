'use client'

/**
 * 마이페이지 TanStack Query 훅 (T-114) — 로그인 토큰이 있을 때만 조회
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelReservation,
  changePassword,
  getInquiry,
  getMe,
  getNotifications,
  linkSocialUrl,
  listInquiries,
  listReservations,
  listSocialAccounts,
  unlinkSocial,
  updateMe,
  updateNotifications,
  withdraw,
  type NotificationSettings,
  type ReservationStatus,
  type WithdrawalReason,
} from '@/lib/memberAccount'
import type { MemberApiError } from '@/lib/memberAuth'
import type { SocialProvider } from '@/lib/memberSocial'
import { useMemberStore } from '@/lib/memberStore'

export const accountKeys = {
  all: (slug: string) => ['member', slug, 'account'] as const,
  me: (slug: string) => ['member', slug, 'account', 'me'] as const,
  notifications: (slug: string) => ['member', slug, 'account', 'notifications'] as const,
  reservations: (slug: string, status: string | null, months: number | null) =>
    ['member', slug, 'account', 'reservations', status, months] as const,
  inquiries: (slug: string) => ['member', slug, 'account', 'inquiries'] as const,
  inquiry: (slug: string, id: string) => ['member', slug, 'account', 'inquiry', id] as const,
  social: (slug: string) => ['member', slug, 'account', 'social'] as const,
}

const useSignedIn = (slug: string) =>
  useMemberStore((s) => s.slug === slug && s.accessToken !== null)

export const useMe = (slug: string) =>
  useQuery({ queryKey: accountKeys.me(slug), queryFn: () => getMe(slug), enabled: useSignedIn(slug) })

export const useUpdateMe = (slug: string) => {
  const client = useQueryClient()
  return useMutation<
    Awaited<ReturnType<typeof updateMe>>,
    MemberApiError,
    Parameters<typeof updateMe>[1]
  >({
    mutationFn: (patch) => updateMe(slug, patch),
    onSuccess: (me) => client.setQueryData(accountKeys.me(slug), me),
  })
}

export const useChangePassword = (slug: string) => {
  const setAccessToken = useMemberStore((s) => s.setAccessToken)
  const client = useQueryClient()
  return useMutation<
    Awaited<ReturnType<typeof changePassword>>,
    MemberApiError,
    Parameters<typeof changePassword>[1]
  >({
    mutationFn: (body) => changePassword(slug, body),
    // 다른 기기는 로그아웃 — 이 기기는 새 토큰으로 계속
    onSuccess: ({ access_token }) => {
      setAccessToken(access_token)
      void client.invalidateQueries({ queryKey: accountKeys.me(slug) })
      void client.invalidateQueries({ queryKey: accountKeys.social(slug) })
    },
  })
}

export const useNotifications = (slug: string) =>
  useQuery({
    queryKey: accountKeys.notifications(slug),
    queryFn: () => getNotifications(slug),
    enabled: useSignedIn(slug),
  })

/** 토글 즉시 저장 — 낙관적 업데이트, 실패하면 되돌린다 */
export const useUpdateNotification = (slug: string) => {
  const client = useQueryClient()
  const key = accountKeys.notifications(slug)
  return useMutation<
    NotificationSettings,
    MemberApiError,
    Partial<NotificationSettings>,
    { previous?: NotificationSettings }
  >({
    mutationFn: (patch) => updateNotifications(slug, patch),
    onMutate: async (patch) => {
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<NotificationSettings>(key)
      if (previous) client.setQueryData(key, { ...previous, ...patch })
      return { previous }
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) client.setQueryData(key, context.previous)
    },
    onSuccess: (saved) => client.setQueryData(key, saved),
  })
}

export const useReservations = (
  slug: string,
  status: ReservationStatus | null,
  months: number | null,
  enabled = true,
) =>
  useQuery({
    queryKey: accountKeys.reservations(slug, status, months),
    queryFn: () => listReservations(slug, { status, months }),
    enabled: useSignedIn(slug) && enabled,
  })

export const useCancelReservation = (slug: string) => {
  const client = useQueryClient()
  return useMutation<Awaited<ReturnType<typeof cancelReservation>>, MemberApiError, string>({
    mutationFn: (id) => cancelReservation(slug, id),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: [...accountKeys.all(slug), 'reservations'] }),
  })
}

export const useInquiries = (slug: string) =>
  useQuery({
    queryKey: accountKeys.inquiries(slug),
    queryFn: () => listInquiries(slug),
    enabled: useSignedIn(slug),
  })

export const useInquiryDetail = (slug: string, id: string | null) =>
  useQuery({
    queryKey: accountKeys.inquiry(slug, id ?? ''),
    queryFn: () => getInquiry(slug, id as string),
    enabled: useSignedIn(slug) && Boolean(id),
  })

export const useSocialAccounts = (slug: string) =>
  useQuery({
    queryKey: accountKeys.social(slug),
    queryFn: () => listSocialAccounts(slug),
    enabled: useSignedIn(slug),
  })

export const useLinkSocial = (slug: string) =>
  useMutation<
    Awaited<ReturnType<typeof linkSocialUrl>>,
    MemberApiError,
    { provider: SocialProvider; returnTo: string }
  >({
    mutationFn: ({ provider, returnTo }) => linkSocialUrl(slug, provider, returnTo),
  })

export const useUnlinkSocial = (slug: string) => {
  const client = useQueryClient()
  return useMutation<Awaited<ReturnType<typeof unlinkSocial>>, MemberApiError, SocialProvider>({
    mutationFn: (provider) => unlinkSocial(slug, provider),
    onSuccess: (accounts) => {
      client.setQueryData(accountKeys.social(slug), accounts)
      void client.invalidateQueries({ queryKey: accountKeys.me(slug) })
    },
  })
}

export const useWithdraw = (slug: string) => {
  const client = useQueryClient()
  return useMutation<
    Awaited<ReturnType<typeof withdraw>>,
    MemberApiError,
    { password?: string; reason?: WithdrawalReason | null; reason_detail?: string }
  >({
    mutationFn: (body) => withdraw(slug, body),
    // 세션 정리(자동 로그아웃)는 완료 화면으로 바뀐 뒤 WithdrawFlow 에서 한다
    onSuccess: () => client.removeQueries({ queryKey: ['member', slug] }),
  })
}
