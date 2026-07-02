import { Link } from 'react-router'
import { Lock } from 'lucide-react'

export function FeatureDisabledPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
        <Lock size={28} className="text-slate-400" aria-hidden="true" />
      </div>
      <h1 className="text-lg font-semibold text-slate-900">
        현재 비활성화된 기능입니다
      </h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        이 기능은 아직 사용할 수 없습니다. 요금제 업그레이드 또는 순차 배포 대상이 되면
        자동으로 열립니다.
      </p>
      <Link
        to="/admin/dashboard"
        className="mt-6 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        대시보드로 이동
      </Link>
    </div>
  )
}
