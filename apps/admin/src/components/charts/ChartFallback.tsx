/** 차트 코드(recharts)를 받는 동안 같은 자리 — 부모가 높이를 정한다 (T-043-A) */
export const ChartFallback = () => (
  <div
    role="status"
    aria-label="차트 불러오는 중"
    className="h-full w-full animate-pulse rounded-lg bg-slate-100"
  />
)
