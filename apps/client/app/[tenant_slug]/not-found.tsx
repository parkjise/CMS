import Link from 'next/link'

export default function TenantNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-slate-400">
        404
      </p>
      <h1 className="mt-3 text-2xl font-bold text-slate-900">
        홈페이지를 찾을 수 없습니다
      </h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        주소를 다시 확인해주세요. 운영이 중단되었거나 존재하지 않는 페이지일 수
        있습니다.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
      >
        홈으로 이동
      </Link>
    </main>
  )
}
