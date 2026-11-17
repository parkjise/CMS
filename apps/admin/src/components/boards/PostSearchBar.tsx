import { useState } from 'react'
import { ChevronDown, ChevronUp, RotateCcw, Search, Trash2 } from 'lucide-react'
import type { BoardCategory, PostStatus } from '@cms/types'
import { Button, Input, toast } from '@cms/ui'
import type { PostFilters } from '@/hooks/useBoards'
import { categoryLabel, orderTree } from '@/lib/categoryTree'
import { postDateFilters } from '@/lib/postDateFilters'
import { STATUS_LABELS } from '@/lib/postStatus'

const SELECT = 'h-10 rounded-md border border-slate-300 bg-white px-3 text-sm disabled:opacity-50'

interface PostSearchBarProps {
  filters: PostFilters
  onChange: (filters: PostFilters) => void
  categories: BoardCategory[]
  pageSize: number
}

/**
 * 게시판별 글 관리 검색 (T-214, 1113 #14) — 처음엔 한 줄, [상세보기] 로 둘째 줄
 * (작성자 · 본문 · 작성일). 오른쪽 끝에 [상세보기] [초기화] [휴지통] [검색].
 */
export function PostSearchBar({ filters, onChange, categories, pageSize }: PostSearchBarProps) {
  const [keyword, setKeyword] = useState(filters.q ?? '')
  const [author, setAuthor] = useState(filters.author ?? '')
  const [bodyQ, setBodyQ] = useState(filters.body_q ?? '')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [open, setOpen] = useState(false)
  // 둘째 줄에 넣은 조건 수 — 접어 두어도 버튼에 보인다
  const detailCount = [author.trim(), bodyQ.trim(), start || end].filter(Boolean).length

  const search = () => {
    let dates: { created_from?: string; created_before?: string }
    try {
      dates = postDateFilters(start, end)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '작성일을 확인해 주세요.')
      return
    }
    onChange({
      ...filters,
      page: 1,
      q: keyword.trim() || undefined,
      author: author.trim() || undefined,
      body_q: bodyQ.trim() || undefined,
      ...dates,
    })
  }

  const reset = () => {
    setKeyword('')
    setAuthor('')
    setBodyQ('')
    setStart('')
    setEnd('')
    onChange({ page: 1, size: pageSize })
  }

  return (
    <form
      className="space-y-3 border-b border-slate-200 px-5 py-4"
      aria-label="글 검색"
      onSubmit={(e) => {
        e.preventDefault()
        search()
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-64">
          <Input
            aria-label="제목 검색"
            placeholder="제목 검색"
            value={keyword}
            maxLength={100}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <select
          aria-label="상태"
          className={SELECT}
          value={filters.status ?? ''}
          disabled={Boolean(filters.trash)}
          onChange={(e) =>
            onChange({
              ...filters,
              page: 1,
              status: (e.target.value || undefined) as PostStatus | undefined,
            })
          }
        >
          <option value="">전체</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {categories.length > 0 && (
          <select
            aria-label="카테고리"
            className={SELECT}
            value={filters.category_id ?? ''}
            onChange={(e) =>
              onChange({ ...filters, page: 1, category_id: e.target.value || undefined })
            }
          >
            <option value="">모든 카테고리</option>
            {orderTree(categories).map((c) => (
              <option key={c.id} value={c.id}>
                {categoryLabel(c, categories)}
              </option>
            ))}
          </select>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            aria-expanded={open}
            aria-controls="post-search-detail"
            onClick={() => setOpen(!open)}
          >
            {open ? (
              <ChevronUp className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden />
            )}
            상세보기{detailCount > 0 && ` ${detailCount}`}
          </Button>
          <Button type="button" variant="ghost" onClick={reset}>
            <RotateCcw className="h-4 w-4" aria-hidden />
            초기화
          </Button>
          <Button
            type="button"
            variant={filters.trash ? 'primary' : 'secondary'}
            aria-pressed={Boolean(filters.trash)}
            onClick={() =>
              onChange({
                ...filters,
                page: 1,
                status: undefined,
                trash: !filters.trash || undefined,
              })
            }
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            휴지통
          </Button>
          <Button type="submit" variant="secondary">
            <Search className="h-4 w-4" aria-hidden />
            검색
          </Button>
        </div>
      </div>
      {open && (
        <div id="post-search-detail" className="flex flex-wrap items-center gap-2">
          <div className="w-full sm:w-48">
            <Input
              aria-label="작성자"
              placeholder="작성자"
              value={author}
              maxLength={100}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-64">
            <Input
              aria-label="본문 검색"
              placeholder="본문 검색"
              value={bodyQ}
              maxLength={100}
              onChange={(e) => setBodyQ(e.target.value)}
            />
          </div>
          <span className="text-sm text-slate-500">작성일</span>
          <input
            type="date"
            aria-label="작성일 시작"
            className={SELECT}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          <span className="text-slate-400">~</span>
          <input
            type="date"
            aria-label="작성일 끝"
            className={SELECT}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
      )}
    </form>
  )
}
