import { Compass } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@cms/ui'

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
          <Compass className="h-6 w-6" />
        </div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">
          404
        </p>
        <h1 className="mb-2 text-xl font-bold text-slate-900">
          요청한 페이지를 찾을 수 없습니다
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          주소가 잘못되었거나 이동된 페이지입니다.
        </p>
        <Link to="/admin/dashboard">
          <Button>대시보드로 이동</Button>
        </Link>
      </div>
    </div>
  )
}
