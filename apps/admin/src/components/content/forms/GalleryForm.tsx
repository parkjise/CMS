import { useRef, useState } from 'react'
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { isAxiosError } from 'axios'
import { ChevronDown, ChevronUp, GripVertical, ImagePlus, Link2, Trash2 } from 'lucide-react'
import { Button, Input, toast } from '@cms/ui'
import { isUploadableImage, useUploadImage } from '@/hooks/useUploadImage'
import { pickErrorMessage } from '@/lib/errorMessages'
import { FormField } from './FormField'
import { SaveBar } from './HeroBannerForm'
import { getJsonSetting, getSetting, isRichSetting, jsonSetting, strSetting } from './utils'
import type { SectionFormProps } from './types'

/** 갤러리 — 여러 장 업로드 · 드래그 순서 · 캡션 (T-064-A, 백엔드 gallery_settings.py 와 같은 한도) */
const GALLERY_MAX_ITEMS = 30
const GALLERY_CAPTION_MAX = 100

interface GalleryItem {
  image_url: string
  caption: string
}

/** 드래그 정렬용 화면 id 를 붙인 항목 (저장할 때는 뺀다) */
interface Row extends GalleryItem {
  id: string
}

let rowSeq = 0
const toRow = (item: GalleryItem): Row => ({ ...item, id: `row-${(rowSeq += 1)}` })

export function GalleryForm({ section, isSaving, onSubmit }: SectionFormProps) {
  const [title, setTitle] = useState(getSetting(section.settings, 'section_title'))
  const [rows, setRows] = useState<Row[]>(() =>
    getJsonSetting<GalleryItem[]>(section.settings, 'gallery_items', []).map(toRow)
  )
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const upload = useUploadImage()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const isFull = rows.length >= GALLERY_MAX_ITEMS

  const updateRow = (id: string, patch: Partial<GalleryItem>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id))

  const moveRow = (id: string, delta: -1 | 1) =>
    setRows((prev) => {
      const from = prev.findIndex((r) => r.id === id)
      const to = from + delta
      return from === -1 || to < 0 || to >= prev.length ? prev : arrayMove(prev, from, to)
    })

  const addUrlRow = () => setRows((prev) => [...prev, toRow({ image_url: '', caption: '' })])

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    setRows((prev) => {
      const from = prev.findIndex((r) => r.id === active.id)
      const to = prev.findIndex((r) => r.id === over.id)
      return from === -1 || to === -1 ? prev : arrayMove(prev, from, to)
    })
  }

  const handleFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? [])
    if (!files.length) return
    const slots = GALLERY_MAX_ITEMS - rows.length
    const accepted = files.filter(isUploadableImage)
    const queue = accepted.slice(0, Math.max(0, slots))
    const skipped = accepted.length - queue.length
    let failed = files.length - accepted.length

    setProgress({ done: 0, total: queue.length })
    let done = 0
    for (const [idx, file] of queue.entries()) {
      try {
        const result = await upload.mutateAsync({ file, sectionId: section.id, context: 'gallery' })
        setRows((prev) => [...prev, toRow({ image_url: result.url, caption: '' })])
        done += 1
      } catch (err) {
        if (isAxiosError(err) && err.response?.status === 422) {
          // 저장 공간 한도 — 남은 파일도 실패하므로 멈춘다
          toast.error(pickErrorMessage(err, '저장 공간 한도를 초과했습니다.'))
          failed += queue.length - idx
          break
        }
        failed += 1
      }
      setProgress({ done, total: queue.length })
    }
    setProgress(null)

    if (done) toast.success(`사진 ${done}장을 올렸습니다. 저장을 눌러 반영하세요.`)
    if (failed) toast.error(`사진 ${failed}장은 올리지 못했습니다.`)
    if (skipped) toast.error(`최대 ${GALLERY_MAX_ITEMS}장이라 ${skipped}장은 제외했습니다.`)
  }

  const handleSave = async () => {
    // 주소를 비워 둔 행은 저장하지 않는다
    const items = rows
      .filter((r) => r.image_url.trim())
      .map(({ image_url, caption }) => ({ image_url: image_url.trim(), caption: caption.trim() }))
    await onSubmit([strSetting('section_title', title), jsonSetting('gallery_items', items)])
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        handleSave()
      }}
    >
      <FormField label="섹션 제목" rich={isRichSetting(section.settings, 'section_title')}>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 시설 갤러리"
        />
      </FormField>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium text-slate-700">
            갤러리 이미지{' '}
            <span className="text-xs font-normal text-slate-500">
              {rows.length} / {GALLERY_MAX_ITEMS}장
            </span>
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addUrlRow}
              disabled={isFull || progress !== null}
            >
              <Link2 className="h-3.5 w-3.5" /> 주소로 추가
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => fileInput.current?.click()}
              disabled={isFull || progress !== null}
            >
              <ImagePlus className="h-3.5 w-3.5" />
              {progress ? `업로드 중 (${progress.done}/${progress.total})` : '사진 업로드'}
            </Button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            aria-label="갤러리 사진 선택"
            onChange={(e) => {
              void handleFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
        <p className="text-xs text-slate-500">
          여러 장을 한 번에 선택할 수 있습니다 (장당 20MB, WebP 로 자동 최적화). 왼쪽 손잡이를
          끌거나 위 · 아래 버튼으로 순서를 바꿉니다.
        </p>

        {rows.length === 0 && (
          <p className="rounded-md border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
            등록된 이미지가 없습니다.
          </p>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-3">
              {rows.map((row, idx) => (
                <GalleryRow
                  key={row.id}
                  row={row}
                  index={idx}
                  isLast={idx === rows.length - 1}
                  onMove={(delta) => moveRow(row.id, delta)}
                  onChange={(patch) => updateRow(row.id, patch)}
                  onRemove={() => removeRow(row.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </div>

      <SaveBar isSaving={isSaving || progress !== null} />
    </form>
  )
}

interface GalleryRowProps {
  row: Row
  index: number
  isLast: boolean
  onMove: (delta: -1 | 1) => void
  onChange: (patch: Partial<GalleryItem>) => void
  onRemove: () => void
}

function GalleryRow({ row, index, isLast, onMove, onChange, onRemove }: GalleryRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      aria-label={`갤러리 사진 ${index + 1}`}
      className={`flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 ${
        isDragging ? 'z-10 shadow-lg' : ''
      }`}
    >
      <button
        type="button"
        className="mt-5 cursor-grab text-slate-400 hover:text-slate-600"
        aria-label={`사진 ${index + 1} 순서 변경`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-white">
        {row.image_url ? (
          <img
            src={row.image_url}
            alt={row.caption || '갤러리 미리보기'}
            className="h-full w-full object-cover"
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <span className="text-xs text-slate-300">미리보기</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <Input
          type="url"
          value={row.image_url}
          onChange={(e) => onChange({ image_url: e.target.value })}
          placeholder="이미지 URL"
          aria-label={`사진 ${index + 1} 주소`}
        />
        <Input
          value={row.caption}
          maxLength={GALLERY_CAPTION_MAX}
          onChange={(e) => onChange({ caption: e.target.value })}
          placeholder="캡션 (선택)"
          aria-label={`사진 ${index + 1} 캡션`}
        />
      </div>
      <div className="flex flex-col items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          aria-label="위로 이동"
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onMove(1)}
          disabled={isLast}
          aria-label="아래로 이동"
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label="삭제">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </li>
  )
}
