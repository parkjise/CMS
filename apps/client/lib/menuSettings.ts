// 상단 메뉴 설정 (T-036-B) — 관리자 공통 설정 → 상단 메뉴

/** 저장된 메뉴 값 — key 는 테마형이면 섹션 id, 코드형이면 페이지 key */
export interface MenuOverride {
  key: string
  label: string | null
  visible: boolean
}

/**
 * 템플릿 기본 메뉴 위에 저장값을 덮어쓴다 — 숨긴 메뉴는 빼고, 이름이 있으면 바꾼다.
 * reorderable(코드형)이면 저장한 순서대로, 새로 생긴 메뉴는 기본 순서로 뒤에.
 * 저장값에 없는 메뉴는 기본값(보이기 · 기본 이름) 그대로.
 */
export function applyMenu<T extends { key: string; label: string }>(
  items: T[],
  saved: MenuOverride[] | null | undefined,
  reorderable: boolean,
): T[] {
  if (!saved?.length) return items
  const byKey = new Map(saved.map((s) => [s.key, s]))
  let ordered = items
  if (reorderable) {
    const rank = new Map(saved.map((s, i) => [s.key, i]))
    ordered = [...items].sort((a, b) => {
      const ra = rank.get(a.key) ?? Number.MAX_SAFE_INTEGER
      const rb = rank.get(b.key) ?? Number.MAX_SAFE_INTEGER
      return ra === rb ? items.indexOf(a) - items.indexOf(b) : ra - rb
    })
  }
  return ordered
    .filter((item) => byKey.get(item.key)?.visible !== false)
    .map((item) => {
      const label = byKey.get(item.key)?.label?.trim()
      return label ? { ...item, label } : item
    })
}
