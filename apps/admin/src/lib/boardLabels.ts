import type { BoardType } from '@cms/types'

/** 게시판 유형 — 2단계에서 만드는 세 가지 (게시판 모듈 기획서 7장) */
export const BOARD_TYPES: { value: BoardType; label: string; hint: string }[] = [
  { value: 'LIST', label: '목록형', hint: '공지 · 소식처럼 제목을 줄지어 보여 줍니다.' },
  { value: 'GALLERY', label: '갤러리형', hint: '사진 중심으로 카드처럼 보여 줍니다.' },
  { value: 'FAQ', label: 'FAQ형', hint: '질문을 누르면 답변이 펼쳐집니다.' },
  { value: 'CARD', label: '카드형', hint: '채용공고 · 프로젝트처럼 요약과 칸 값을 카드로 보여 줍니다.' },
]

export const boardTypeLabel = (value: string): string =>
  BOARD_TYPES.find((t) => t.value === value)?.label ?? value

/** 서버 슬러그 규칙과 같다 (schemas/board.py) */
export const BOARD_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export const boardSlugError = (slug: string): string | undefined =>
  slug.length >= 2 && BOARD_SLUG_PATTERN.test(slug)
    ? undefined
    : '영문 소문자 · 숫자 · 하이픈으로 2자 이상 입력해주세요.'

/** 모든 게시판에 늘 있는 칸 — 지우거나 바꿀 수 없다 (T-187) */
export const BASE_FIELDS = [
  { label: '제목', key: 'title', required: true },
  { label: '내용', key: 'body', required: true },
  { label: '작성자', key: 'author', required: false },
  { label: '작성일', key: 'created_at', required: false },
  { label: '상단 고정', key: 'is_pinned', required: false },
  { label: '공개 상태', key: 'status', required: false },
]
