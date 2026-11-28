import { useState } from 'react'
import { Link } from 'react-router'
import { Input } from '@cms/ui'
import { flattenCategories, useContentCategories, useContentTags } from '@/hooks/useContentItems'
import { useContentTypes } from '@/hooks/useContentTypes'
import { FormField } from './FormField'
import { SaveBar } from './HeroBannerForm'
import { getSetting, strSetting } from './utils'
import type { SectionFormProps } from './types'

const TITLE_MAX = 40
const EMPTY_TEXT_MAX = 100
const DEFAULT_COUNT = '6'
const COUNTS = [3, 4, 6, 8, 9, 12, 16, 24]
const SELECT = 'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm'

// 보여 주는 방식 · 정렬 — 백엔드 app/services/content_section.py 와 같은 값
const DISPLAY_OPTIONS = [
  { value: 'CARD', label: '카드', hint: '대표 사진 · 제목 · 요약을 칸으로 보여 줘요.' },
  { value: 'LIST', label: '목록', hint: '제목 · 요약을 줄로 보여 줘요.' },
  { value: 'FAQ', label: 'FAQ', hint: '제목(질문)을 누르면 본문(답변)이 펼쳐져요.' },
  { value: 'TIMELINE', label: '연혁', hint: "'연도' 칸 값과 제목 · 요약을 세로 선으로 보여 줘요." },
  { value: 'LOGO', label: '로고 줄', hint: "대표 사진(로고)을 한 줄로, '링크' 칸이 있으면 누르면 열려요." },
] as const
const SORT_OPTIONS = [
  { value: 'order', label: '정해 둔 순서' },
  { value: 'latest', label: '최근 공개 순' },
  { value: 'title', label: '제목 순' },
] as const

/** 테마형 콘텐츠 연결 (T-258, 콘텐츠 관리 기획서 5장) — 고른 유형의 공개 콘텐츠 */
export function ContentListForm({ section, isSaving, onSubmit }: SectionFormProps) {
  const types = useContentTypes().data?.types ?? []
  const [title, setTitle] = useState(getSetting(section.settings, 'section_title'))
  const [typeId, setTypeId] = useState(getSetting(section.settings, 'content_type'))
  const [category, setCategory] = useState(getSetting(section.settings, 'category_id'))
  const [tag, setTag] = useState(getSetting(section.settings, 'tag_id'))
  const [count, setCount] = useState(getSetting(section.settings, 'item_count') || DEFAULT_COUNT)
  const [display, setDisplay] = useState(getSetting(section.settings, 'display_mode') || 'CARD')
  const [sort, setSort] = useState(getSetting(section.settings, 'sort') || 'order')
  const [emptyText, setEmptyText] = useState(getSetting(section.settings, 'empty_text'))
  const categories = flattenCategories(useContentCategories(typeId || undefined).data ?? [])
  const tags = useContentTags().data ?? []
  // 지운 유형 · 카테고리 · 태그는 비어 보인다 — 저장하면 비워진다
  const typeMissing = typeId !== '' && types.length > 0 && !types.some((t) => t.id === typeId)
  const shownCategory = categories.some((c) => c.id === category) ? category : ''
  const shownTag = tags.some((t) => t.id === tag) ? tag : ''
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
          strSetting('content_type', typeMissing ? '' : typeId),
          strSetting('category_id', shownCategory),
          strSetting('tag_id', shownTag),
          strSetting('item_count', count),
          strSetting('display_mode', display),
          strSetting('sort', sort),
          strSetting('empty_text', emptyText),
        ])
      }}
    >
      <FormField label="섹션 제목" hint={overLimit ? `${TITLE_MAX}자 이하로 적어 주세요.` : undefined}>
        <Input
          aria-label="섹션 제목"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="콘텐츠"
        />
      </FormField>
      <div className="text-sm">
        <label className="block">
          <span className="mb-1.5 block font-medium text-slate-700">보여 줄 콘텐츠 유형</span>
          <select
            aria-label="보여 줄 콘텐츠 유형"
            className={SELECT}
            value={typeMissing ? '' : typeId}
            onChange={(e) => {
              // 유형을 바꾸면 카테고리는 그 유형 것이 아니다
              setTypeId(e.target.value)
              setCategory('')
            }}
          >
            <option value="">선택하세요</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {typeMissing ? (
          <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800" role="alert">
            연결된 유형이 없어요. 지운 유형이에요. 유형을 다시 골라 주세요.
          </p>
        ) : types.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">
            아직 콘텐츠 유형이 없어요.{' '}
            <Link to="/admin/contents/types" className="text-blue-700 hover:underline">
              콘텐츠 유형 만들기
            </Link>
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-500">
            공개한 콘텐츠만 보여요. 유형을 고르지 않았거나 콘텐츠가 없으면 홈페이지에서 이 섹션이
            보이지 않아요.
          </p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-slate-700">카테고리</span>
          <select
            aria-label="카테고리"
            className={SELECT}
            value={shownCategory}
            disabled={!typeId || categories.length === 0}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">전체</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-slate-700">태그</span>
          <select
            aria-label="태그"
            className={SELECT}
            value={shownTag}
            disabled={tags.length === 0}
            onChange={(e) => setTag(e.target.value)}
          >
            <option value="">전체</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                #{t.name}
              </option>
            ))}
          </select>
        </label>
      </div>
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
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-slate-700">개수</span>
          <select
            aria-label="개수"
            className={SELECT}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          >
            {COUNTS.map((n) => (
              <option key={n} value={String(n)}>
                {n}개
              </option>
            ))}
          </select>
        </label>
      </div>
      <FormField
        label="콘텐츠가 없을 때 문구 (선택)"
        hint={
          emptyOver
            ? `${EMPTY_TEXT_MAX}자 이하로 적어 주세요.`
            : '비워 두면 콘텐츠가 없을 때 섹션을 숨겨요.'
        }
      >
        <Input
          aria-label="콘텐츠가 없을 때 문구"
          value={emptyText}
          onChange={(e) => setEmptyText(e.target.value)}
          placeholder="예: 곧 소개해 드릴게요."
        />
      </FormField>
      <div className="rounded-lg bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
        <p className="font-medium text-slate-700">보여 주는 내용</p>
        <p className="mt-1">
          제목 ← 콘텐츠 제목 · 설명 ← 요약 · 사진 ← 대표 사진. 유형의 추가 칸(직책 · 가격 등)도
          함께 보여요. 연혁은 &lsquo;연도&rsquo; 칸, 로고 줄은 &lsquo;링크&rsquo; 칸을 써요.
        </p>
      </div>
      <SaveBar isSaving={isSaving} disabled={overLimit || emptyOver} />
    </form>
  )
}
