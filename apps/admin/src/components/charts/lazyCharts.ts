import { lazy } from 'react'

// recharts(약 80KB gzip)는 차트를 그릴 때만 필요하다. 페이지 코드와 따로, 차트 데이터가
// 온 뒤에 받아 페이지 글자 · 숫자와 중요한 데이터 요청이 차트 코드를 기다리거나
// 느린 회선에서 대역폭을 나눠 쓰지 않게 한다 (T-043-A).
const loadVisitorLine = () => import('./VisitorLinePlot')
const loadTrendLine = () => import('./TrendLinePlot')
const loadRatioPie = () => import('./RatioPiePlot')

export const VisitorLinePlot = lazy(() =>
  loadVisitorLine().then((m) => ({ default: m.VisitorLinePlot })),
)
export const TrendLinePlot = lazy(() =>
  loadTrendLine().then((m) => ({ default: m.TrendLinePlot })),
)
export const RatioPiePlot = lazy(() =>
  loadRatioPie().then((m) => ({ default: m.RatioPiePlot })),
)
