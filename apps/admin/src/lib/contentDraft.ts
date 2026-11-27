import type { BodyNode } from '@cms/types'
import type { CustomValues } from '@/lib/customFields'

/**
 * 저장하지 않은 콘텐츠 (T-256, 콘텐츠 관리 기획서 CM-02) — 서버가 아닌 이 브라우저에만.
 * 공개 중인 콘텐츠를 서버에 자동 저장하면 쓰다 만 내용이 홈페이지에 나가기 때문.
 */
export interface ContentDraft {
  saved_at: string
  title: string
  summary: string
  body: BodyNode[]
  thumbnail_url: string
  category_id: string
  tags: string[]
  data: CustomValues
}

const PREFIX = 'cms-content-draft'

export const contentDraftKey = (typeId: string, itemId?: string) =>
  `${PREFIX}:${typeId}:${itemId ?? 'new'}`

/** 보관본 — 없거나 깨졌으면 null. 저장소를 못 쓰는 브라우저도 null */
export const readContentDraft = (key: string): ContentDraft | null => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const draft = JSON.parse(raw) as ContentDraft
    const valid =
      typeof draft?.saved_at === 'string' &&
      typeof draft.title === 'string' &&
      Array.isArray(draft.body) &&
      Array.isArray(draft.tags)
    return valid ? draft : null
  } catch {
    return null
  }
}

export const writeContentDraft = (key: string, draft: ContentDraft) => {
  try {
    localStorage.setItem(key, JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

export const clearContentDraft = (key: string) => {
  try {
    localStorage.removeItem(key)
  } catch {
    // 저장소를 못 쓰면 지울 것도 없다
  }
}
