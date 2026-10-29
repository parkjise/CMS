import { Sparkles } from 'lucide-react'
import { Link } from 'react-router'

interface SampleReminderProps {
  /** 아직 바꾸지 않은 샘플 값 수 — 대시보드 통계(`sample_count`)에서 받는다 (T-043-A) */
  count: number
}

/**
 * 대시보드 할 일 카드 — 아직 바꾸지 않은 템플릿 샘플 값 (AD-01, 기획서 11.8)
 * 샘플이 없으면 아무것도 그리지 않는다.
 */
export function SampleReminder({ count }: SampleReminderProps) {
  if (count === 0) return null

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold text-amber-900">
            샘플 {count}개 남음
          </p>
          <p className="text-sm text-amber-800">
            템플릿 샘플 문구·이미지가 아직 홈페이지에 그대로 있어요. 우리 사업체
            내용으로 바꿔주세요.
          </p>
        </div>
      </div>
      <Link
        to="/admin/content"
        className="inline-flex flex-shrink-0 items-center justify-center rounded-md bg-amber-700 px-3 py-2 text-sm font-medium text-white hover:bg-amber-800"
      >
        콘텐츠 바꾸러 가기
      </Link>
    </div>
  )
}
