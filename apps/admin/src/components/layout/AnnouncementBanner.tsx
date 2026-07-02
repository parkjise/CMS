import { AlertTriangle, Info, Megaphone, Sparkles, X } from 'lucide-react'
import type { AnnouncementType } from '@/stores/featureStore'
import { useFeatureStore } from '@/stores/featureStore'

/** 공지 유형별 색상/아이콘 (기획서 14.5) */
const TYPE_STYLES: Record<
  AnnouncementType,
  { className: string; icon: typeof Info }
> = {
  INFO: { className: 'bg-blue-50 text-blue-800 border-blue-200', icon: Info },
  WARNING: {
    className: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: AlertTriangle,
  },
  URGENT: { className: 'bg-red-50 text-red-800 border-red-200', icon: AlertTriangle },
  FEATURE_UPDATE: {
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    icon: Sparkles,
  },
  MAINTENANCE: {
    className: 'bg-slate-50 text-slate-700 border-slate-200',
    icon: Megaphone,
  },
}

export function AnnouncementBanner() {
  const announcements = useFeatureStore((s) => s.announcements)
  const markAnnouncementRead = useFeatureStore((s) => s.markAnnouncementRead)

  const unread = announcements.filter((a) => !a.is_read)
  if (unread.length === 0) return null

  return (
    <div className="space-y-px" role="region" aria-label="공지사항">
      {unread.map((ann) => {
        const { className, icon: Icon } = TYPE_STYLES[ann.type] ?? TYPE_STYLES.INFO
        return (
          <div
            key={ann.id}
            data-type={ann.type}
            className={`flex items-center gap-3 border-b px-4 py-2.5 text-sm ${className}`}
          >
            <Icon size={16} aria-hidden="true" className="shrink-0" />
            <span className="min-w-0 flex-1 truncate font-medium">{ann.title}</span>
            <button
              type="button"
              onClick={() => markAnnouncementRead(ann.id)}
              className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium hover:bg-black/5"
            >
              확인
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
