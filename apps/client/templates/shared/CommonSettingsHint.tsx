'use client'

import { ExternalLink } from 'lucide-react'
import { selectEditingUi, useEditStore } from '@/lib/editStore'

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3001'

/** 관리자 공통 설정 탭 주소 (T-125-F) */
export const COMMON_SETTINGS_URL = `${ADMIN_URL}/admin/content?tab=settings`

interface Props {
  /** 무엇을 공통 설정에서 바꾸는지 (예: '주소 · 대표전화 · 주차 · 운영 시간') */
  what: string
  editable: boolean
}

/**
 * 편집 모드 안내 — 이 글자는 사이트 공통 설정(사업체 정보)에서 가져오므로 여기서 고치지 않고
 * 관리자 공통 설정에서 바꾼다 (푸터 · 상담 링크와 한 곳에서 관리). 방문자 화면 · 미리보기에는 없다.
 */
export function CommonSettingsHint({ what, editable }: Props) {
  const isEditing = useEditStore(selectEditingUi)
  if (!editable || !isEditing) return null
  return (
    <p className="tpl-common-hint">
      {what}은(는) 관리자 <strong>공통 설정</strong>에서 바꿔요 — 푸터에도 같이 반영됩니다.{' '}
      <a href={COMMON_SETTINGS_URL} target="_blank" rel="noopener noreferrer">
        공통 설정 열기
        <ExternalLink aria-hidden="true" />
      </a>
    </p>
  )
}
