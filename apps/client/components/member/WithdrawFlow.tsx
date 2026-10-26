'use client'

import { useEffect, useState } from 'react'
import { useMemberStore } from '@/lib/memberStore'
import RequireMember from './RequireMember'
import WithdrawForm, { WithdrawDone } from './WithdrawForm'

/**
 * 탈퇴 화면 — 완료 화면은 로그인 확인(RequireMember) 밖에 둔다.
 * 안에 두면 세션이 끝나는 순간 로그인 화면으로 먼저 이동해 버린다 (T-114 E2E 에서 발견).
 */
const WithdrawFlow = ({ slug }: { slug: string }) => {
  const [done, setDone] = useState(false)
  const clear = useMemberStore((s) => s.clear)

  // 완료 화면으로 바뀐 다음 세션을 비운다 (자동 로그아웃 — 서버 세션 · 쿠키는 이미 끝남).
  // 스토어 갱신은 바로 다시 그려지므로 먼저 비우면 RequireMember 가 로그인으로 보내 버린다.
  useEffect(() => {
    if (done) clear()
  }, [done, clear])

  if (done) return <WithdrawDone slug={slug} />
  return (
    <RequireMember slug={slug}>
      <WithdrawForm slug={slug} onDone={() => setDone(true)} />
    </RequireMember>
  )
}

export default WithdrawFlow
