import { Lock } from 'lucide-react'
import { Button } from '@cms/ui'
import { useAuthStore } from '@/stores/authStore'

/** 구독 만료(SUSPENDED) 시 접근을 차단하고 재구독을 유도하는 페이지. */
export function SubscriptionExpiredPage() {
  const logout = useAuthStore((s) => s.logout)

  const handleLogout = async () => {
    await logout()
    window.location.href = '/login'
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
        <Lock size={28} className="text-slate-400" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-bold text-slate-900">구독이 종료되었습니다</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        구독이 끝나 서비스 이용이 일시 중단되었습니다. 결제 수단을 등록하면 바로 결제되고
        즉시 다시 이용하실 수 있습니다.
      </p>
      <div className="mt-6 flex gap-2">
        <Button onClick={() => (window.location.href = '/admin/billing?tab=method')}>
          재구독하기
        </Button>
        <Button variant="ghost" onClick={handleLogout}>
          로그아웃
        </Button>
      </div>
    </div>
  )
}
