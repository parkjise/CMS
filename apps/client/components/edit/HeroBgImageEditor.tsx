'use client'

import { useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { useEditStore } from '@/lib/editStore'
import { ImageUploadModal } from './ImageUploadModal'

interface Props {
  sectionId: string
  field: string
  initialUrl: string
}

/**
 * HeroBanner는 bg_image_url을 CSS background로 적용하므로
 * EditableImage(next/image 기반)로 감쌀 수 없다.
 * 우상단 플로팅 버튼으로 업로드 모달을 띄운다.
 */
export function HeroBgImageEditor({ sectionId, field, initialUrl }: Props) {
  const isEditMode = useEditStore((s) => s.isEditMode)
  const updateField = useEditStore((s) => s.updateField)
  const [open, setOpen] = useState(false)

  if (!isEditMode) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="배경 이미지 변경"
        className="absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-[var(--border-radius-base)] bg-[var(--color-background)]/95 px-3 py-1.5 text-xs font-medium text-[color:var(--color-text-primary)] shadow-md backdrop-blur transition hover:bg-[var(--color-background)]"
      >
        <ImagePlus className="h-3.5 w-3.5" />
        배경 이미지
      </button>

      <ImageUploadModal
        open={open}
        onClose={() => setOpen(false)}
        onUploaded={(newUrl) => updateField(sectionId, field, newUrl, initialUrl)}
        sectionId={sectionId}
        context="hero"
      />
    </>
  )
}
