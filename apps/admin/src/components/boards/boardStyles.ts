/**
 * 게시판 관리 화면 공통 모양 (T-187, UI/UX 시안 v3) — Tailwind 클래스 묶음.
 * 강조색은 blue-* 를 써서 관리자 화면 색상 설정(테마)을 그대로 따른다.
 */

/** 화면 바깥 틀 */
// 다른 관리자 화면과 같은 바깥 틀 — 최대 폭 없이 화면 가득 (T-192)
export const PAGE = 'space-y-6 p-6 md:p-8'

/** 흰 카드 */
export const CARD = 'rounded-xl border border-slate-200 bg-white p-6 shadow-sm'

/** 표 · 목록을 담는 카드 (안쪽 여백 없음) */
export const LIST_CARD = 'overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'

/** 카드 안 작은 제목 */
export const PANEL_LABEL =
  'mb-4 flex items-center justify-between gap-2 text-sm font-semibold text-slate-800'

/** 링크를 버튼처럼 */
export const LINK_PRIMARY =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700'
export const LINK_SECONDARY =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50'

/** 표 머리 · 칸 */
export const TH =
  'whitespace-nowrap bg-slate-50 px-4 py-3 text-left text-xs font-medium text-slate-500'
export const TD = 'px-4 py-4 align-middle'

/** 상태 표시 */
export const TAG =
  'inline-flex items-center whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium'
export const TAG_DEFAULT = `${TAG} bg-slate-100 text-slate-600`
export const TAG_GREEN = `${TAG} bg-emerald-50 text-emerald-700`
export const TAG_OFF = `${TAG} bg-slate-100 text-slate-500`
export const TAG_AMBER = `${TAG} bg-amber-50 text-amber-700`

/** 표 안 아이콘 버튼 */
export const ICON_BUTTON =
  'inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400'

/** 입력칸 */
export const INPUT =
  'h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20'

/** 아래쪽 도움말 띠 */
export const HELP_STRIP =
  'flex flex-wrap items-center gap-3 rounded-lg bg-slate-100 px-4 py-3.5 text-xs leading-relaxed text-slate-500'
