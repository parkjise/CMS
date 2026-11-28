'use client'

import { canEditSite, useClientAuthStore } from '@/lib/authStore'
import type { ContentUnavailable } from '@/lib/publicContents'

const MESSAGES: Record<Exclude<ContentUnavailable, 'ERROR'>, string> = {
  FEATURE_OFF: '콘텐츠 관리 기능이 꺼져 있어 이 섹션은 방문자에게 보이지 않아요.',
  TYPE_MISSING:
    '연결한 콘텐츠 유형을 찾을 수 없어 이 섹션은 방문자에게 보이지 않아요. 관리자 화면에서 유형을 다시 골라 주세요.',
}

interface ContentListNoticeProps {
  sectionId: string
  reason: Exclude<ContentUnavailable, 'ERROR'>
}

/**
 * 콘텐츠 연결 섹션을 못 그릴 때 (T-261, 콘텐츠 관리 기획서 7장 8번) —
 * 이 사이트를 고칠 수 있는 관리자에게만 이유를 보여 준다. 방문자에게는 아무것도 없다.
 */
export const ContentListNotice = ({ sectionId, reason }: ContentListNoticeProps) => {
  const canEdit = useClientAuthStore(canEditSite)
  if (!canEdit) return null
  return (
    <section
      data-section-id={sectionId}
      data-section-type="CONTENT_LIST"
      data-admin-notice={reason}
      className="px-6 py-8"
    >
      <div
        role="note"
        className="mx-auto max-w-4xl rounded-lg border border-dashed border-amber-400 bg-amber-50 px-5 py-4 text-sm text-amber-900"
      >
        <p className="font-semibold">관리자에게만 보이는 안내</p>
        <p className="mt-1">{MESSAGES[reason]}</p>
      </div>
    </section>
  )
}
