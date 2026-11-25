import { useState } from 'react'
import { Input } from '@cms/ui'
import { useBoardCategories } from '@/hooks/useBoardCategories'
import { FormField } from './FormField'
import { SaveBar } from './HeroBannerForm'
import { CONNECT_COUNTS, LATEST_BOARD_KEY, POST_COUNT_KEY, latestSettings } from './latestBoard'
import { LatestBoardFields } from './LatestBoardFields'
import { getSetting, strSetting } from './utils'
import type { SectionFormProps } from './types'

const TITLE_MAX = 40
const EMPTY_TEXT_MAX = 100
const SELECT = 'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm'

// 보여 주는 방식 · 정렬 — 백엔드 app/services/board_latest.py 와 같은 값
const DISPLAY_OPTIONS = [
  { value: 'LIST', label: '목록', hint: '제목 · 날짜를 줄로 보여 줘요.' },
  { value: 'CARD', label: '카드', hint: '대표 사진 · 제목 · 요약을 칸으로 보여 줘요.' },
  { value: 'FAQ', label: 'FAQ', hint: '질문을 누르면 답변(본문)이 펼쳐져요.' },
  { value: 'TIMELINE', label: '연혁', hint: '연도 · 제목 · 요약을 세로 선으로 보여 줘요.' },
] as const
const SORT_OPTIONS = [
  { value: 'latest', label: '최신순' },
  { value: 'oldest', label: '오래된 순' },
  { value: 'board', label: '게시판 순서 (상단 고정 먼저)' },
] as const

/** 테마형 게시판 연결 (T-185 최신 글 → T-243, 페이지 기획서 PM-05) — 칸 매핑은 고정 */
export function BoardLatestForm({ section, isSaving, onSubmit }: SectionFormProps) {
  const [title, setTitle] = useState(getSetting(section.settings, 'section_title'))
  const [latest, setLatest] = useState({
    board: getSetting(section.settings, LATEST_BOARD_KEY),
    count: getSetting(section.settings, POST_COUNT_KEY),
  })
  const [display, setDisplay] = useState(getSetting(section.settings, 'display_mode') || 'LIST')
  const [sort, setSort] = useState(getSetting(section.settings, 'sort') || 'latest')
  const [category, setCategory] = useState(getSetting(section.settings, 'category_id'))
  const [emptyText, setEmptyText] = useState(getSetting(section.settings, 'empty_text'))
  const categoriesQuery = useBoardCategories(latest.board, { enabled: latest.board !== '' })
  const categories = (latest.board && categoriesQuery.data) || []
  // 지운 분류 · 다른 게시판의 분류는 '전체'로 보인다 — 저장하면 비워진다
  const shownCategory = categories.some((c) => c.id === category) ? category : ''
  const overLimit = title.length > TITLE_MAX
  const emptyOver = emptyText.length > EMPTY_TEXT_MAX
  const displayHint = DISPLAY_OPTIONS.find((o) => o.value === display)?.hint

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (overLimit || emptyOver) return
        onSubmit([
          strSetting('section_title', title),
          ...latestSettings(latest),
          strSetting('display_mode', display),
          strSetting('sort', sort),
          strSetting('category_id', shownCategory),
          strSetting('empty_text', emptyText),
        ])
      }}
    >
      <FormField label="섹션 제목" hint={overLimit ? `${TITLE_MAX}자 이하로 적어 주세요.` : undefined}>
        <Input
          aria-label="섹션 제목"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="최신 글"
        />
      </FormField>
      <LatestBoardFields
        value={latest}
        onChange={(next) => {
          // 게시판을 바꾸면 분류는 그 게시판 것이 아니다
          if (next.board !== latest.board) setCategory('')
          setLatest(next)
        }}
        emptyLabel="선택하세요"
        defaultCount={5}
        counts={CONNECT_COUNTS}
        hint="공개 글만 보여요. 비밀글은 빠지고, 회원만 읽는 게시판은 고를 수 없어요. 게시판을 고르지 않았거나, 비활성 게시판이거나, 글이 없으면 홈페이지에서 이 섹션이 보이지 않아요."
      />
      <div className="text-sm">
        <label className="block">
          <span className="mb-1.5 block font-medium text-slate-700">보여 주는 방식</span>
          <select
            aria-label="보여 주는 방식"
            className={SELECT}
            value={display}
            onChange={(e) => setDisplay(e.target.value)}
          >
            {DISPLAY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {displayHint && <p className="mt-1 text-xs text-slate-500">{displayHint}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-slate-700">분류</span>
          <select
            aria-label="분류"
            className={SELECT}
            value={shownCategory}
            disabled={!latest.board || categories.length === 0}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">전체</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parent_id ? `└ ${c.name}` : c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-slate-700">정렬</span>
          <select
            aria-label="정렬"
            className={SELECT}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <FormField
        label="글이 없을 때 문구 (선택)"
        hint={
          emptyOver
            ? `${EMPTY_TEXT_MAX}자 이하로 적어 주세요.`
            : '비워 두면 글이 없을 때 섹션을 숨겨요.'
        }
      >
        <Input
          aria-label="글이 없을 때 문구"
          value={emptyText}
          onChange={(e) => setEmptyText(e.target.value)}
          placeholder="예: 곧 소식을 전해 드릴게요."
        />
      </FormField>
      <div className="rounded-lg bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
        <p className="font-medium text-slate-700">보여 주는 내용</p>
        <p className="mt-1">
          제목 ← 글 제목 · 설명 ← 본문 앞부분 · 사진 ← 본문 첫 사진 · 날짜 ← 공개일. 글 목록에
          표시로 고른 칸(직책 · 연도 등)도 함께 보여요. 연혁은 &lsquo;연도&rsquo; 칸이 있으면 그
          값을, 없으면 공개일의 해를 써요.
        </p>
      </div>
      <SaveBar isSaving={isSaving} disabled={overLimit || emptyOver} />
    </form>
  )
}
