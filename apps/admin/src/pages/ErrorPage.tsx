import { AlertTriangle } from 'lucide-react'
import { useRouteError } from 'react-router'
import { Button } from '@cms/ui'

/** React Router의 errorElement로 사용 — 라우터 단에서 throw된 에러 처리. */
export function ErrorPage() {
  const error = useRouteError() as { status?: number; message?: string } | null
  const status = error?.status

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">
          {status ?? '오류'}
        </p>
        <h1 className="mb-2 text-xl font-bold text-slate-900">
          문제가 발생했습니다
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          {error?.message ??
            '잠시 후 다시 시도해주세요. 문제가 계속되면 새로고침해주세요.'}
        </p>
        <div className="flex gap-2">
          <Button onClick={() => window.location.reload()}>새로고침</Button>
          <Button
            variant="secondary"
            onClick={() => (window.location.href = '/admin/dashboard')}
          >
            대시보드로 이동
          </Button>
        </div>
      </div>
    </div>
  )
}
