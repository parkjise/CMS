// 목록 칸 값 읽기 (T-037-E)

export type ListItem = Record<string, unknown>

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
