import { useRef } from 'react'
import { ArrowDown, ArrowUp, Image as ImageIcon, List, Pilcrow, Trash2 } from 'lucide-react'
import type { BodyBlock } from '@cms/types'
import { Button, Input, Textarea } from '@cms/ui'
import { ImageUploadField } from '@/components/content/forms/ImageUploadField'

// 글 본문 편집기 — 문단 · 목록 · 사진 블록을 쌓는다 (게시판 모듈 기획서 10장).
// HTML 을 다루지 않아 저장 값이 곧 화면 구조다. 글자 서식은 **굵게** 만.

export interface DraftBlock {
  key: number
  block: BodyBlock
}

const BLOCK_LABELS: Record<BodyBlock['type'], string> = {
  p: '문단',
  ul: '목록',
  image: '사진',
}

const EMPTY_BLOCKS: Record<BodyBlock['type'], BodyBlock> = {
  p: { type: 'p', text: '' },
  ul: { type: 'ul', items: [] },
  image: { type: 'image', src: '', alt: '' },
}

export const toDraft = (body: BodyBlock[]): DraftBlock[] =>
  body.map((block, key) => ({ key, block }))

/** 저장할 본문 — 빈 문단 · 빈 줄 · 사진 없는 칸은 뺀다 */
export const fromDraft = (blocks: DraftBlock[]): BodyBlock[] =>
  blocks.flatMap(({ block }): BodyBlock[] => {
    if (block.type === 'p') return block.text.trim() ? [block] : []
    if (block.type === 'image') return block.src ? [block] : []
    const items = block.items.map((i) => i.trim()).filter(Boolean)
    return items.length ? [{ type: 'ul', items }] : []
  })

interface BodyBlockEditorProps {
  value: DraftBlock[]
  onChange: (next: DraftBlock[]) => void
}

export function BodyBlockEditor({ value, onChange }: BodyBlockEditorProps) {
  // 불러온 블록의 key(0..n-1) 다음부터
  const nextKey = useRef(value.length)

  const add = (type: BodyBlock['type']) => {
    onChange([...value, { key: nextKey.current++, block: EMPTY_BLOCKS[type] }])
  }
  const update = (key: number, block: BodyBlock) => {
    onChange(value.map((d) => (d.key === key ? { key, block } : d)))
  }
  const remove = (key: number) => {
    onChange(value.filter((d) => d.key !== key))
  }
  const move = (index: number, delta: number) => {
    const next = [...value]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item)
    onChange(next)
  }

  return (
    <div className="space-y-3">
      {value.length === 0 && (
        <p className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
          아래 버튼으로 문단이나 사진을 추가하세요.
        </p>
      )}

      {value.map(({ key, block }, index) => {
        const label = `${BLOCK_LABELS[block.type]} ${index + 1}`
        return (
          <div key={key} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">{label}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`${label} 위로`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  className="rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`${label} 아래로`}
                  disabled={index === value.length - 1}
                  onClick={() => move(index, 1)}
                  className="rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                >
                  <ArrowDown className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`${label} 삭제`}
                  onClick={() => remove(key)}
                  className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>

            {block.type === 'p' && (
              <Textarea
                aria-label={label}
                rows={4}
                maxLength={5000}
                value={block.text}
                placeholder="내용을 입력하세요. 강조할 글자는 **이렇게** 감싸면 굵게 보입니다."
                onChange={(e) => update(key, { type: 'p', text: e.target.value })}
              />
            )}

            {block.type === 'ul' && (
              <Textarea
                aria-label={label}
                rows={4}
                value={block.items.join('\n')}
                placeholder="한 줄에 항목 하나씩 입력하세요."
                onChange={(e) => update(key, { type: 'ul', items: e.target.value.split('\n') })}
              />
            )}

            {block.type === 'image' && (
              <div className="space-y-3">
                <ImageUploadField
                  label="사진"
                  context="board"
                  value={block.src}
                  onChange={(src) => update(key, { ...block, src })}
                />
                <Input
                  label="사진 설명"
                  maxLength={200}
                  value={block.alt}
                  placeholder="사진을 볼 수 없는 분께 읽어 주는 설명"
                  onChange={(e) => update(key, { ...block, alt: e.target.value })}
                />
              </div>
            )}
          </div>
        )
      })}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => add('p')}>
          <Pilcrow className="h-4 w-4" aria-hidden />
          문단 추가
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => add('ul')}>
          <List className="h-4 w-4" aria-hidden />
          목록 추가
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => add('image')}>
          <ImageIcon className="h-4 w-4" aria-hidden />
          사진 추가
        </Button>
      </div>
    </div>
  )
}
