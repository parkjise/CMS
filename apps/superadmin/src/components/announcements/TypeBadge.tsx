import type { AnnouncementType } from '@/hooks/useAnnouncements'

const STYLES: Record<AnnouncementType, { className: string; label: string }> = {
  INFO: { className: 'bg-blue-100 text-blue-700', label: '정보' },
  WARNING: { className: 'bg-amber-100 text-amber-700', label: '주의' },
  URGENT: { className: 'bg-red-100 text-red-700', label: '긴급' },
  FEATURE_UPDATE: { className: 'bg-emerald-100 text-emerald-700', label: '기능 업데이트' },
  MAINTENANCE: { className: 'bg-slate-200 text-slate-700', label: '점검' },
}

export function TypeBadge({ type }: { type: AnnouncementType }) {
  const style = STYLES[type] ?? STYLES.INFO
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${style.className}`}
    >
      {style.label}
    </span>
  )
}
