import type { BodyNode } from '@cms/types'
import type { CustomValues } from '@/lib/customFields'

/**
 * 저장하지 않은 글 (T-190) — 서버가 아닌 이 브라우저에만 둔다.
 * 공개된 글을 서버에 자동 저장하면 쓰다 만 내용이 홈페이지에 나가기 때문.
 */
export interface PostDraft {
  saved_at: string
  title: string
  body: BodyNode[]
  is_pinned: boolean
  is_secret: boolean
  category_id: string
  custom: CustomValues
}

const PREFIX = 'cms-post-draft'

export const draftKey = (boardId: string, postId?: string) =>
  `${PREFIX}:${boardId}:${postId ?? 'new'}`

/** 보관본 — 없거나 깨졌으면 null. 저장소를 못 쓰는 브라우저도 null */
export const readDraft = (key: string): PostDraft | null => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const draft = JSON.parse(raw) as PostDraft
    const valid =
      typeof draft?.saved_at === 'string' &&
      typeof draft.title === 'string' &&
      Array.isArray(draft.body)
    return valid ? draft : null
  } catch {
    return null
  }
}

export const writeDraft = (key: string, draft: PostDraft) => {
  try {
    localStorage.setItem(key, JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

export const clearDraft = (key: string) => {
  try {
    localStorage.removeItem(key)
  } catch {
    // 저장소를 못 쓰면 지울 것도 없다
  }
}
