'use client'

/** hospital-a 회원 화면 분기 (T-124) — /{slug}/member/{page} */
import MemberProviders from '@/components/member/MemberProviders'
import RequireMember from '@/components/member/RequireMember'
import type { MemberRoute } from '../../../shared/contracts'
import {
  FindEmailScreen,
  FindPasswordScreen,
  JoinScreen,
  JoinSocialScreen,
  LoginScreen,
  ResetPasswordScreen,
} from './AuthScreens'
import { MypageScreen } from './MypageScreen'
import { WithdrawDoneScreen, WithdrawScreen, useWithdrawFlow } from './WithdrawScreen'

interface Props {
  slug: string
  brandName: string
  route: MemberRoute
}

const Withdraw = ({ slug, brandName }: { slug: string; brandName: string }) => {
  const flow = useWithdrawFlow()
  if (flow.done) return <WithdrawDoneScreen slug={slug} brandName={brandName} />
  return (
    <RequireMember slug={slug}>
      <WithdrawScreen slug={slug} onDone={flow.finish} />
    </RequireMember>
  )
}

export const MemberScreen = ({ slug, brandName, route }: Props) => {
  const next = route.query.next ?? null
  const screen = (() => {
    switch (route.page) {
      case 'login':
        return <LoginScreen slug={slug} next={next} brandName={brandName} />
      case 'join':
        return <JoinScreen slug={slug} next={next} />
      case 'join-social':
        return <JoinSocialScreen slug={slug} />
      case 'find-email':
        return <FindEmailScreen slug={slug} />
      case 'find-password':
        return <FindPasswordScreen slug={slug} />
      case 'reset-password':
        return <ResetPasswordScreen slug={slug} token={route.query.token ?? ''} />
      case 'mypage':
        return (
          <RequireMember slug={slug}>
            <MypageScreen slug={slug} brandName={brandName} />
          </RequireMember>
        )
      case 'withdraw':
        return <Withdraw slug={slug} brandName={brandName} />
    }
  })()
  return <MemberProviders>{screen}</MemberProviders>
}
