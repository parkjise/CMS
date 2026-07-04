import { AnnouncementForm } from '@/components/announcements/AnnouncementForm'
import { AnnouncementList } from '@/components/announcements/AnnouncementList'

export function AnnouncementsPage() {
  return (
    <div className="p-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">공지 및 알림 관리</h1>
        <p className="mt-1 text-sm text-slate-500">공지 작성 · 발송 (SA-05)</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AnnouncementForm />
        <AnnouncementList />
      </div>
    </div>
  )
}
