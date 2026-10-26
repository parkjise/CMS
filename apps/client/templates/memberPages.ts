/**
 * 방문자 회원 화면 목록 (T-113 · T-114 · T-124) — 미들웨어(edge)에서도 쓰므로 가볍게 (화면 import 없음).
 *
 * /{slug}/member/{page} — 기본은 모든 테넌트 공통 화면(app/[tenant_slug]/member).
 * 회원 화면을 직접 그리는 코드형 템플릿이면 템플릿 전용 라우트로 보내 헤더 · 서브 히어로 · 푸터 안에 그린다.
 */
export const MEMBER_PAGES = {
  login: '로그인',
  join: '회원가입',
  'join-social': '추가 정보 입력',
  'find-email': '이메일 찾기',
  'find-password': '비밀번호 찾기',
  'reset-password': '새 비밀번호 설정',
  mypage: '마이페이지',
  withdraw: '회원 탈퇴',
} as const

export type MemberPageKey = keyof typeof MEMBER_PAGES

export const isMemberPage = (value: string | undefined): value is MemberPageKey =>
  Boolean(value && Object.prototype.hasOwnProperty.call(MEMBER_PAGES, value))

/** 회원 화면을 템플릿 디자인으로 직접 그리는 코드형 템플릿 (폴더 키) */
export const MEMBER_SCREEN_TEMPLATES = new Set(['hospital-a'])
