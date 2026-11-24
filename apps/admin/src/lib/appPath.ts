/**
 * 앱이 놓인 하위 경로 (T-236) — 보통 '' 이고, GitHub Pages 개발 배포는 '/CMS/admin'
 * (`vite build --base=/CMS/admin/`). 라우터 basename 과 라우터 밖 이동에 쓴다.
 */
export const APP_BASE = import.meta.env.BASE_URL.replace(/\/+$/, '')

/** 화면 주소 → 브라우저 주소 — 라우터 밖에서 새로 불러올 때 (로그아웃 · 오류 화면) */
export const appPath = (path: string, base = APP_BASE): string => `${base}${path}`

/** 브라우저 주소 → 화면 주소 — 하위 경로를 뗀다 */
export const routePath = (pathname: string, base = APP_BASE): string =>
  base && (pathname === base || pathname.startsWith(`${base}/`))
    ? pathname.slice(base.length) || '/'
    : pathname
