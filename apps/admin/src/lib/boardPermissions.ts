import type { BoardPermissions } from '@cms/types'

/** 권한 선택지 · 설명 — 권한 구역과 게시판 만들기 4단계가 같이 쓴다 (T-150, T-211) */
export interface PermissionOption<T extends string> {
  value: T
  label: string
  hint: string
}

export const READ_OPTIONS: PermissionOption<BoardPermissions['read']>[] = [
  {
    value: 'PUBLIC',
    label: '누구나',
    hint: '홈페이지 방문자 모두 글을 읽습니다. 검색 결과에도 나올 수 있습니다.',
  },
  {
    value: 'MEMBER',
    label: '회원만',
    hint: '로그인한 방문자 회원만 글을 읽습니다. 검색 결과와 사이트맵에서 빠집니다.',
  },
]

export const WRITE_OPTIONS: PermissionOption<BoardPermissions['write']>[] = [
  {
    value: 'ADMIN',
    label: '관리자만',
    hint: '관리자 화면과 홈페이지의 [글쓰기] 버튼으로 관리자만 씁니다.',
  },
  {
    value: 'MEMBER',
    label: '회원도',
    hint: '로그인한 방문자 회원도 홈페이지에서 글을 쓰고, 자기 글을 고치거나 지웁니다. 글은 바로 공개됩니다.',
  },
]
