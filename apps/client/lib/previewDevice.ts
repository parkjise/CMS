/**
 * 미리보기 기기 폭 (T-246, 페이지 기획서 PM-03) — PC 는 그대로, 태블릿 · 휴대폰은 그 폭의 틀 안에 같은 미리보기.
 * 틀 안 화면은 실제 그 폭이라 미디어 쿼리 · 햄버거 메뉴가 그대로 보인다.
 */
export type PreviewDevice = 'pc' | 'tablet' | 'mobile'

export const PREVIEW_DEVICES: { key: PreviewDevice; label: string; width: number | null }[] = [
  { key: 'pc', label: 'PC', width: null },
  { key: 'tablet', label: '태블릿', width: 768 },
  { key: 'mobile', label: '휴대폰', width: 390 },
]

export const previewDevice = (value?: string): PreviewDevice =>
  value === 'tablet' || value === 'mobile' ? value : 'pc'

export const deviceWidth = (device: PreviewDevice): number | null =>
  PREVIEW_DEVICES.find((d) => d.key === device)?.width ?? null

/**
 * 같은 미리보기의 다른 기기 주소 — 주소 뒤 물음표부터만 만들어 지금 경로(연결 도메인이면 슬러그 없음)를 그대로 쓴다.
 * PC 면 device 를 빼서 틀 안(iframe) 주소로도 쓴다.
 */
export function previewDeviceHref(
  query: Record<string, string | string[] | undefined>,
  device: PreviewDevice,
): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (key === 'device' || typeof value !== 'string') continue
    params.set(key, value)
  }
  if (device !== 'pc') params.set('device', device)
  return `?${params.toString()}`
}
