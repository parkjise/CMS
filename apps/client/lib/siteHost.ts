/**
 * 고객 도메인(커스텀 도메인)으로 접속했는지 판단 (T-137, 기획서 15.3).
 * 메인 서비스 주소 · localhost · IP · 점 없는 내부 이름(컨테이너)은 고객 도메인이 아니다.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

const hostnameOf = (url: string): string => {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return 'localhost'
  }
}

export const mainHostname = (): string => hostnameOf(SITE_URL)

export const mainSiteUrl = (): string => SITE_URL.replace(/\/+$/, '')

export const hostnameFromHeader = (host: string | null | undefined): string =>
  (host ?? '').trim().toLowerCase().split(':', 1)[0].replace(/\.$/, '')

export function isCustomHost(hostname: string): boolean {
  const host = hostnameFromHeader(hostname)
  if (!host || !host.includes('.')) return false
  if (host === 'localhost' || /^[\d.]+$/.test(host) || host.includes('[')) return false
  const main = mainHostname().replace(/^www\./, '')
  return host !== main && !host.endsWith(`.${main}`)
}

/** 미들웨어가 고객 도메인 요청에 붙이는 헤더 — 방문자가 보낸 값은 지운다 */
export const CUSTOM_HOST_HEADER = 'x-site-custom-host'

/** 브라우저에서 지금 고객 도메인인지 — 이벤트 처리 · API 주소용 (서버 렌더링에는 쓰지 말 것) */
export const onCustomHost = (): boolean =>
  typeof window !== 'undefined' && isCustomHost(window.location.hostname)

/** 이동할 주소 — 고객 도메인에서는 slug 를 뺀다. 클릭 · 로그인 후 이동처럼 브라우저에서만 호출 */
export function sitePath(slug: string, path = ''): string {
  if (onCustomHost()) return path || '/'
  return `/${slug}${path}`
}
