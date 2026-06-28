/**
 * 템플릿 미리보기 URL 빌더 (T-057).
 * 관리자 페이지에서 고객 홈페이지의 미리보기 페이지를 새 탭으로 열 때 사용한다.
 */
const CLIENT_BASE_URL =
  import.meta.env.VITE_CLIENT_BASE_URL ?? 'http://localhost:3000'

export function buildTemplatePreviewUrl(
  tenantSlug: string,
  templateId: string,
): string {
  const base = CLIENT_BASE_URL.replace(/\/$/, '')
  const slug = encodeURIComponent(tenantSlug)
  const tpl = encodeURIComponent(templateId)
  return `${base}/${slug}/preview?tpl=${tpl}`
}

/** 미리보기 URL을 새 탭에서 연다 (noopener). */
export function openTemplatePreview(
  tenantSlug: string,
  templateId: string,
): void {
  const url = buildTemplatePreviewUrl(tenantSlug, templateId)
  window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * 템플릿 썸네일 등 클라이언트 앱(public/)이 서빙하는 정적 자산 경로를 절대 URL로 변환.
 * 이미 절대 URL이면 그대로 반환한다.
 */
export function resolveClientAssetUrl(path: string | null | undefined): string {
  if (!path) return ''
  if (/^https?:\/\//.test(path)) return path
  const base = CLIENT_BASE_URL.replace(/\/$/, '')
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`
}
