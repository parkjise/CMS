import type { SiteAvailability } from '@/lib/siteAvailability'

/** 구독이 끝나 잠시 닫힌 홈페이지 — 방문자에게 404 대신 (T-201, 기획서 10.2 #11 · 15.2) */
export function SitePaused({ site }: { site: SiteAvailability }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
      <p className="text-sm font-medium text-slate-400">{site.name}</p>
      <h1 className="mt-3 text-2xl font-bold text-slate-900">홈페이지를 잠시 쉬고 있어요</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
        지금은 홈페이지를 볼 수 없어요. 궁금한 점은 사업자에게 직접 문의해 주세요.
      </p>
      {site.phone && (
        <a
          href={`tel:${site.phone.replaceAll('-', '')}`}
          className="mt-6 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          전화 {site.phone}
        </a>
      )}
    </main>
  )
}
