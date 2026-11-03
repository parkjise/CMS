'use client'

import { useEditStore } from '@/lib/editStore'
import { getString } from '@/lib/sectionSettings'
import type { PublicSection } from '@/lib/publicSite.types'

/**
 * 코드형 템플릿 칸의 저장 전 값(pendingChanges) 읽기 · 바꾸기 (T-125-B, T-125-C).
 *
 * 저장 전 값은 편집 모드에서만 보여 준다 (EditableText 와 같은 규칙) — 초안은 localStorage 에
 * 남아 첫 렌더부터 읽히므로, 편집 모드 밖에서도 쓰면 서버 HTML 과 달라 hydration 경고가 난다.
 */

export const parseList = (raw: string | undefined): unknown[] | null => {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** 칸의 지금 값 — 편집 모드면 저장 전 값, 아니면 저장된 값 */
export function useFieldDraft(section: PublicSection, field: string) {
  const isEditMode = useEditStore((s) => s.isEditMode)
  const pending = useEditStore((s) => s.pendingChanges[`${section.id}:${field}`])
  const initial = getString(section.settings, field)
  return { initial, value: isEditMode && pending ? pending.new_value : initial }
}

/**
 * 목록 칸에서 한 항목의 한 키만 바꿔 목록 전체를 저장 대기에 올린다.
 * key 가 없으면 글자만 있는 목록(["항목", …])의 그 항목 글자를 바꾼다 (T-125-E).
 * 최신 대기 값 위에서 바꾼다 — 같은 목록의 다른 항목을 먼저 바꿨어도 서로 덮어쓰지 않는다.
 */
export function replaceListItem(
  section: PublicSection,
  field: string,
  index: number,
  key: string | undefined,
  value: string,
) {
  const { pendingChanges, updateField } = useEditStore.getState()
  const initial = getString(section.settings, field)
  const next = parseList(pendingChanges[`${section.id}:${field}`]?.new_value ?? initial)
  const item = next?.[index]
  if (!next || item === undefined) return
  if (key === undefined) {
    if (typeof item !== 'string') return
    next[index] = value
  } else {
    if (item === null || typeof item !== 'object') return
    next[index] = { ...(item as Record<string, unknown>), [key]: value }
  }
  updateField(section.id, field, JSON.stringify(next), initial)
}

/** 목록 항목의 글자 값 — key 가 없으면 항목 자체(글자 목록). 없거나 글자가 아니면 '' */
export const itemString = (list: unknown[] | null, index: number, key?: string) => {
  const item = list?.[index]
  const v = key === undefined ? item : item && typeof item === 'object' ? (item as Record<string, unknown>)[key] : undefined
  return typeof v === 'string' ? v : ''
}
