export default function GlobalNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-slate-400">
        404
      </p>
      <h1 className="mt-3 text-2xl font-bold text-slate-900">
        페이지를 찾을 수 없습니다
      </h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        요청하신 페이지가 존재하지 않습니다.
      </p>
    </main>
  )
}
