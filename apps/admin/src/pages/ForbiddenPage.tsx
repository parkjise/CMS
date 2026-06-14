import { ShieldOff } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@cms/ui'

export function ForbiddenPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <ShieldOff className="h-6 w-6" />
        </div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">
          403
        </p>
        <h1 className="mb-2 text-xl font-bold text-slate-900">
          접근 권한이 없습니다
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          이 페이지에 접근하려면 권한이 필요합니다. 관리자에게 문의하세요.
        </p>
        <Link to="/admin/dashboard">
          <Button>대시보드로 이동</Button>
        </Link>
      </div>
    </div>
  )
}
