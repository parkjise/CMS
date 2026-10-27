/**
 * API 기본 주소.
 * - 브라우저: 공개 주소(NEXT_PUBLIC_API_BASE_URL — 빌드 때 고정)
 * - 서버(SSR · 미들웨어): API_INTERNAL_URL 이 있으면 그 주소 (예: http://backend:8000/api).
 *   실행 시점에 읽으므로 이미지를 다시 빌드하지 않고 바꿀 수 있고, 공개 도메인을 거쳐
 *   자기 서버로 되돌아오는 요청(일부 클라우드에서 막힘)을 피한다 (운영 배포 B1)
 */
export const PUBLIC_API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api'

export const serverApiBase = (): string =>
  (typeof window === 'undefined' && process.env.API_INTERNAL_URL) || PUBLIC_API_BASE
