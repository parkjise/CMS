import type { ReportItem } from '@/hooks/useReports'

// 리포트 항목 → 고치러 갈 화면 (T-073-A). 섹션이 있으면 그 섹션 편집, 아니면 관련 화면.
const PAGE_BY_CODE: Record<string, { to: string; label: string }> = {
  seo_description_missing: { to: '/admin/seo', label: 'SEO 설정으로' },
  no_visitors: { to: '/admin/seo', label: '검색 등록 안내 보기' },
  contact_missing: { to: '/admin/content', label: '섹션 추가하러 가기' },
  sample_left: { to: '/admin/content', label: '콘텐츠 편집으로' },
  inquiries_down: { to: '/admin/content', label: '콘텐츠 편집으로' },
}

export function fixLink(item: ReportItem): { to: string; label: string } | null {
  if (item.section_id) {
    return { to: `/admin/content/${item.section_id}`, label: '이 섹션 고치러 가기' }
  }
  return PAGE_BY_CODE[item.code] ?? null
}

/** "2026-09-01" → "2026년 9월" */
export const periodLabel = (period: string) => {
  const [y, m] = period.split('-')
  return `${y}년 ${Number(m)}월`
}
