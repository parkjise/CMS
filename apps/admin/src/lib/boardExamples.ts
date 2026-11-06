import type { BoardType } from '@cms/types'

interface BoardExample {
  id: string
  name: string
  description: string
  board_type: BoardType
}

/** 이름 · 설명 · 표시 유형만 제안한다. 저장은 기존 생성 화면에서 한다. */
export const BOARD_EXAMPLES: BoardExample[] = [
  { id: 'news', name: '소식', description: '새로운 소식과 안내를 전합니다.', board_type: 'LIST' },
  {
    id: 'photos',
    name: '사진 모음',
    description: '사진으로 공간과 활동을 소개합니다.',
    board_type: 'GALLERY',
  },
  {
    id: 'faq',
    name: '자주 묻는 질문',
    description: '자주 받는 질문과 답변을 모았습니다.',
    board_type: 'FAQ',
  },
  {
    id: 'jobs',
    name: '채용 안내',
    description: '모집 중인 채용 소식과 지원 방법을 안내합니다.',
    board_type: 'CARD',
  },
]
