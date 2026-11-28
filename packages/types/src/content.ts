import type { BodyNode, PublicFieldValue } from './board'

/** 콘텐츠 연결 섹션의 공개 콘텐츠 (T-258, 콘텐츠 관리 기획서 5장) */
export interface PublicContentItem {
  id: string
  title: string
  summary: string
  /** 대표 사진 */
  thumbnail: string | null
  /** FAQ 로 보여 줄 때만 */
  body: BodyNode[] | null
  /** 유형의 추가 칸 — 값이 있는 칸만, 고르기 칸은 이름으로 */
  fields: PublicFieldValue[]
  published_at: string | null
  /** 저장 전 미리보기에서만 true (T-261) */
  is_draft?: boolean
}
