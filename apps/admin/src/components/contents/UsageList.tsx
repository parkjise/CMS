import { Link } from 'react-router'
import type { ContentUsage } from '@/hooks/useContentItems'

/** 이 유형 · 콘텐츠를 보여 주는 홈페이지 섹션 (T-258) — 누르면 그 섹션 편집으로 */
export function UsageList({ usage }: { usage: ContentUsage[] }) {
  return (
    <ul className="mt-1 list-disc space-y-0.5 pl-5" aria-label="사용 위치">
      {usage.map((u) => (
        <li key={u.section_id}>
          <Link
            to={`/admin/pages/${u.page_key}/sections/${u.section_id}`}
            className="underline hover:no-underline"
          >
            {u.page_title} 페이지의 &lsquo;{u.label}&rsquo; 섹션
          </Link>
          {!u.is_active && ' (숨김)'}
        </li>
      ))}
    </ul>
  )
}
