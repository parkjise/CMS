'use client'

import { useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { isAxiosError } from 'axios'
import { ChevronLeft, ChevronRight, ImagePlus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useEditStore } from '@/lib/editStore'
import { GalleryGrid } from '@/components/sections/GalleryGrid'
import { uploadImage, validateImageFile } from '@/lib/uploadImage'
import type { GalleryItem } from '@/components/sections/types'

/** 갤러리 다중 이미지 인라인 편집 (T-064-A) — 백엔드 services/gallery_settings.py 와 같은 한도 */
export const GALLERY_FIELD = 'gallery_items'
export const GALLERY_MAX_ITEMS = 30
export const GALLERY_CAPTION_MAX = 100

const GRID_CLASS = 'mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4'
const IMAGE_SIZES = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw'
const ICON_BUTTON =
  'inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-background)] text-[color:var(--color-text-primary)] shadow-md transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40'

interface Props {
  sectionId: string
  initialItems: GalleryItem[]
  /** 방문자 화면 (서버 렌더링) — 편집 모드가 아니고 바뀐 내용도 없으면 그대로 보여 준다 */
  children: ReactNode
}

const parseItems = (raw: string | undefined, fallback: GalleryItem[]): GalleryItem[] => {
  if (raw === undefined) return fallback
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as GalleryItem[]) : fallback
  } catch {
    return fallback
  }
}

const uploadErrorMessage = (err: unknown): string | null => {
  if (isAxiosError(err) && err.response?.status === 422) {
    return err.response.data?.error?.message ?? '저장 공간 한도를 초과했습니다.'
  }
  return null
}

export function EditableGallery({ sectionId, initialItems, children }: Props) {
  const isEditMode = useEditStore((s) => s.isEditMode)
  const isPreview = useEditStore((s) => s.isPreview)
  const pending = useEditStore((s) => s.pendingChanges[`${sectionId}:${GALLERY_FIELD}`])
  const updateField = useEditStore((s) => s.updateField)

  const fileInput = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  if (!isEditMode && !pending) return <>{children}</>

  const items = parseItems(pending?.new_value, initialItems)
  // 미리보기 — 고친 사진 목록을 방문자 화면 그대로 (T-065-B)
  if (isPreview) return <GalleryGrid items={items} />

  const commit = (next: GalleryItem[]) =>
    updateField(sectionId, GALLERY_FIELD, JSON.stringify(next), JSON.stringify(initialItems))

  const updateCaption = (idx: number, caption: string) =>
    commit(items.map((it, i) => (i === idx ? { ...it, caption } : it)))

  const move = (idx: number, delta: -1 | 1) => {
    const target = idx + delta
    if (target < 0 || target >= items.length) return
    const next = [...items]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    commit(next)
  }

  const remove = (idx: number) => commit(items.filter((_, i) => i !== idx))

  const addFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? [])
    if (!files.length) return
    const slots = GALLERY_MAX_ITEMS - items.length
    if (slots <= 0) {
      toast.error(`갤러리 이미지는 최대 ${GALLERY_MAX_ITEMS}장까지 등록할 수 있습니다.`)
      return
    }
    const accepted = files.filter((f) => !validateImageFile(f))
    const invalid = files.length - accepted.length
    const skipped = Math.max(0, accepted.length - slots)
    const queue = accepted.slice(0, slots)

    const added: GalleryItem[] = []
    let attempted = 0
    setProgress({ done: 0, total: queue.length })
    for (const file of queue) {
      attempted += 1
      try {
        const result = await uploadImage(file, sectionId, 'gallery')
        added.push({ image_url: result.url, caption: '' })
      } catch (err) {
        const limitMessage = uploadErrorMessage(err)
        if (limitMessage) {
          // 저장 공간 한도 — 나머지도 실패하므로 멈춘다
          toast.error(limitMessage)
          attempted = queue.length
          break
        }
      }
      setProgress({ done: added.length, total: queue.length })
    }
    setProgress(null)
    const failed = invalid + (attempted - added.length)

    if (added.length) {
      commit([...items, ...added])
      toast.success(`사진 ${added.length}장을 추가했습니다. 저장을 눌러 반영하세요.`)
    }
    if (failed) toast.error(`사진 ${failed}장은 올리지 못했습니다.`)
    if (skipped) toast.error(`최대 ${GALLERY_MAX_ITEMS}장이라 ${skipped}장은 제외했습니다.`)
  }

  return (
    <div data-editable="gallery" data-section-id={sectionId}>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={progress !== null || items.length >= GALLERY_MAX_ITEMS}
          className="inline-flex items-center gap-1.5 rounded-[var(--border-radius-base)] bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[color:var(--color-on-primary)] transition hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ImagePlus className="h-4 w-4" />
          {progress ? `업로드 중 (${progress.done}/${progress.total})` : '사진 추가'}
        </button>
        <span className="text-xs text-[color:var(--color-text-muted)]">
          {items.length} / {GALLERY_MAX_ITEMS}장 · 여러 장을 한 번에 선택할 수 있습니다
        </span>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          aria-label="갤러리 사진 선택"
          onChange={(e) => {
            void addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-[color:var(--color-text-muted)]">
          등록된 이미지가 없습니다. 사진 추가를 눌러 올려 주세요.
        </p>
      ) : (
        <ul className={GRID_CLASS}>
          {items.map((item, idx) => (
            <li
              key={`${item.image_url}-${idx}`}
              aria-label={`갤러리 사진 ${idx + 1}`}
              className="overflow-hidden rounded-[var(--border-radius-card)]"
            >
              <div className="relative aspect-square w-full overflow-hidden">
                <Image
                  src={item.image_url}
                  alt={item.caption || `gallery-${idx}`}
                  fill
                  sizes={IMAGE_SIZES}
                  className="object-cover"
                />
                <div className="absolute inset-x-0 top-0 flex justify-between p-2">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className={ICON_BUTTON}
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      aria-label="앞으로 이동"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className={ICON_BUTTON}
                      onClick={() => move(idx, 1)}
                      disabled={idx === items.length - 1}
                      aria-label="뒤로 이동"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    className={ICON_BUTTON}
                    onClick={() => remove(idx)}
                    aria-label="사진 삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={item.caption}
                maxLength={GALLERY_CAPTION_MAX}
                placeholder="캡션 (선택)"
                aria-label={`사진 ${idx + 1} 캡션`}
                onChange={(e) => updateCaption(idx, e.target.value)}
                className="mt-2 w-full rounded-[var(--border-radius-base)] border border-[color:var(--color-border-strong)] bg-[var(--color-background)] px-2 py-1 text-xs text-[color:var(--color-text-primary)] focus:border-[color:var(--color-primary)] focus:outline-none"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
