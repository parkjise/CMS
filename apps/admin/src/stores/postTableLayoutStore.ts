import { create } from 'zustand'

export type ColumnSize = 'narrow' | 'normal' | 'wide'
export interface PostTableLayout {
  order: string[]
  sizes: Record<string, ColumnSize>
  /** 끌어서 정한 넓이 px (T-215) — 있으면 sizes 보다 먼저. 예전 저장값에는 없다 */
  widths?: Record<string, number>
}

/** 끌어서 정할 수 있는 열 넓이 — 서버(schemas/preference.py)와 같은 범위 */
export const COLUMN_WIDTH_MIN = 96
export const COLUMN_WIDTH_MAX = 640
export const clampColumnWidth = (px: number) =>
  Math.round(Math.min(COLUMN_WIDTH_MAX, Math.max(COLUMN_WIDTH_MIN, px)))
const isColumnWidth = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= COLUMN_WIDTH_MIN &&
  value <= COLUMN_WIDTH_MAX

export const TABLE_SIZE_CLASSES: Record<ColumnSize, string> = {
  narrow: 'min-w-32',
  normal: 'min-w-40',
  wide: 'min-w-64',
}
/** 크기별 기본 넓이 px — min-w 클래스와 같다 (끌기 시작점) */
export const TABLE_SIZE_PX: Record<ColumnSize, number> = { narrow: 128, normal: 160, wide: 256 }

/** 이 열의 넓이 px — 끌어서 정했으면 그 값, 아니면 크기의 기본 넓이 */
export const tableColumnWidth = (layout: PostTableLayout | undefined, id: string): number =>
  layout?.widths?.[id] ?? TABLE_SIZE_PX[tableColumnSize(layout, id)]

export const tableColumnSize = (layout: PostTableLayout | undefined, id: string): ColumnSize => {
  const size = layout?.sizes[id]
  return isColumnSize(size) ? size : 'normal'
}
export const POST_TABLE_STORAGE_KEY = 'cms-admin-post-table-layouts'
const MAX_SCOPES = 100
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 200
export const isColumnSize = (value: unknown): value is ColumnSize =>
  value === 'narrow' || value === 'normal' || value === 'wide'

/** 브라우저 설정은 계정·사업체·게시판마다 구분한다. 계정 정보가 없으면 저장하지 않는다. */
export const postTableScope = (
  tenantId: unknown,
  userId: unknown,
  boardId: unknown
): string | null =>
  [tenantId, userId, boardId].every(isId) ? JSON.stringify([tenantId, userId, boardId]) : null

/** 저장된 값(브라우저 · 서버)에서 유효한 열 ID 순서와 크기만 꺼낸다 — 형식이 아니면 null */
export const toTableLayout = (layout: unknown): PostTableLayout | null => {
  if (!isRecord(layout)) return null
  const order = Array.isArray(layout.order)
    ? [...new Set(layout.order.filter(isId))].slice(0, 20)
    : []
  const sizes: Record<string, ColumnSize> = {}
  if (isRecord(layout.sizes)) {
    for (const [id, size] of Object.entries(layout.sizes).slice(0, 20)) {
      if (isId(id) && isColumnSize(size)) sizes[id] = size
    }
  }
  const widths: Record<string, number> = {}
  if (isRecord(layout.widths)) {
    for (const [id, px] of Object.entries(layout.widths).slice(0, 20)) {
      if (isId(id) && isColumnWidth(px)) widths[id] = px
    }
  }
  // 끌어서 정한 넓이가 없으면 칸을 두지 않는다 — 예전 저장값과 같은 모양
  return Object.keys(widths).length ? { order, sizes, widths } : { order, sizes }
}

export const parseTableLayouts = (raw: string | null): Record<string, PostTableLayout> => {
  try {
    const saved: unknown = JSON.parse(raw ?? 'null')
    if (!isRecord(saved) || saved.version !== 1 || !isRecord(saved.layouts)) return {}
    const entries: [string, PostTableLayout][] = []
    for (const [scope, layout] of Object.entries(saved.layouts).slice(-MAX_SCOPES)) {
      let ids: unknown
      try {
        ids = JSON.parse(scope)
      } catch {
        continue
      }
      if (!Array.isArray(ids) || ids.length !== 3 || !ids.every(isId)) continue
      const parsed = toTableLayout(layout)
      if (parsed) entries.push([scope, parsed])
    }
    return Object.fromEntries(entries)
  } catch {
    return {}
  }
}

export const readTableLayouts = (): Record<string, PostTableLayout> => {
  try {
    return parseTableLayouts(window.localStorage.getItem(POST_TABLE_STORAGE_KEY))
  } catch {
    return {}
  }
}

/** 사라진 열은 제외하고 새로 표시할 열은 기본 순서대로 끝에 추가한다. */
export const orderTableFields = <T extends { id: string }>(
  fields: T[],
  layout?: PostTableLayout
): T[] => {
  const remaining = new Map(fields.map((field) => [field.id, field]))
  const ordered: T[] = []
  for (const id of layout?.order ?? []) {
    const field = remaining.get(id)
    if (field) {
      ordered.push(field)
      remaining.delete(id)
    }
  }
  return [...ordered, ...remaining.values()]
}

interface PostTableLayoutState {
  layouts: Record<string, PostTableLayout>
  /** 이 브라우저에 저장하지 못한 범위 */
  saveFailed: Record<string, boolean>
  /** 계정(서버)에 저장하지 못한 범위 (T-181) */
  serverFailed: Record<string, boolean>
  save: (scope: string, layout: PostTableLayout | null) => void
  setServerFailed: (scope: string, failed: boolean) => void
}

export const usePostTableLayoutStore = create<PostTableLayoutState>((set, get) => ({
  layouts: readTableLayouts(),
  saveFailed: {},
  serverFailed: {},
  setServerFailed: (scope, failed) => {
    const serverFailed = { ...get().serverFailed }
    if (failed) serverFailed[scope] = true
    else delete serverFailed[scope]
    set({ serverFailed })
  },
  save: (scope, layout) => {
    const layouts = { ...get().layouts }
    delete layouts[scope]
    if (layout) layouts[scope] = layout
    const bounded = Object.fromEntries(Object.entries(layouts).slice(-MAX_SCOPES))
    let failed = false
    try {
      window.localStorage.setItem(
        POST_TABLE_STORAGE_KEY,
        JSON.stringify({ version: 1, layouts: bounded })
      )
    } catch {
      failed = true
    }
    set({ layouts: bounded, saveFailed: failed ? { ...get().saveFailed, [scope]: true } : {} })
  },
}))
