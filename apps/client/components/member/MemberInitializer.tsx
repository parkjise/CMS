'use client'

import { useEffect } from 'react'
import { useMemberStore } from '@/lib/memberStore'

interface MemberInitializerProps {
  slug: string
}

/** 페이지 로드 시 방문자 로그인 복원 — 헤더 로그인/마이페이지 메뉴 전환용 (T-113) */
const MemberInitializer = ({ slug }: MemberInitializerProps) => {
  const initialize = useMemberStore((s) => s.initialize)
  useEffect(() => {
    void initialize(slug)
  }, [initialize, slug])
  return null
}

export default MemberInitializer
