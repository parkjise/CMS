export default function Loading() {
  return (
    <main
      className="min-h-screen bg-white"
      role="status"
      aria-live="polite"
      aria-label="홈페이지 로딩 중"
    >
      <header className="border-b border-slate-200 px-6 py-8">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-4 w-24 animate-pulse rounded bg-slate-100" />
      </header>

      <div className="flex flex-col">
        {[0, 1, 2].map((i) => (
          <section
            key={i}
            className="border-b border-dashed border-slate-200 px-6 py-12"
          >
            <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
            <div className="mt-3 h-5 w-3/5 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-4 w-2/5 animate-pulse rounded bg-slate-100" />
          </section>
        ))}
      </div>
    </main>
  )
}
