// 목록 칸 값 읽기 (T-037-E)

export type ListItem = Record<string, unknown>

/** 사진 주소 칸 — 목록 항목 · 섹션 칸 모두 업로드 칸으로 보여 준다 (T-037-E, T-125-B) */
export const isImageKey = (key: string) =>
  key.endsWith('image_url') || key === 'thumb_url' || key === 'icon_url'

/** 목록으로 편집할 수 있는 값인지 — 글자 목록 · 항목(객체) 목록만 */
export function parseList(value: string): string[] | ListItem[] | null {
  const text = value.trim()
  if (!text.startsWith('[')) return null
  try {
    const data: unknown = JSON.parse(text)
    if (!Array.isArray(data)) return null
    if (data.every((v) => typeof v === 'string')) return data as string[]
    if (data.every((v) => v !== null && typeof v === 'object' && !Array.isArray(v))) return data as ListItem[]
    return null
  } catch {
    return null
  }
}
