'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Pencil } from 'lucide-react'
import { useEditStore } from '@/lib/editStore'
import type { ImageContext } from '@/lib/uploadImage'
import { ImageUploadModal } from './ImageUploadModal'

interface Props {
  sectionId: string
  field: string
  initialUrl: string
  context: ImageContext
  alt: string
  sizes?: string
  className?: string
  containerClassName?: string
}

export function EditableImage({
  sectionId,
  field,
  initialUrl,
  context,
  alt,
  sizes,
  className,
  containerClassName,
}: Props) {
  const isEditMode = useEditStore((s) => s.isEditMode)
  const pendingChanges = useEditStore((s) => s.pendingChanges)
  const updateField = useEditStore((s) => s.updateField)

  const [open, setOpen] = useState(false)

  const pending = pendingChanges[`${sectionId}:${field}`]
  const currentUrl = pending?.new_value ?? initialUrl

  const handleUploaded = (newUrl: string) => {
    updateField(sectionId, field, newUrl, initialUrl)
  }

  return (
    <>
      <div
        data-editable="image"
        data-field={field}
        data-section-id={sectionId}
        className={['relative group', containerClassName]
          .filter(Boolean)
          .join(' ')}
        onClick={() => isEditMode && setOpen(true)}
        role={isEditMode ? 'button' : undefined}
        tabIndex={isEditMode ? 0 : undefined}
        onKeyDown={(e) => {
          if (isEditMode && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        <Image
          src={currentUrl}
          alt={alt}
          fill
          sizes={sizes}
          className={className}
        />
        {isEditMode && (
          <div className="image-edit-overlay pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-[var(--border-radius-base)] bg-[var(--color-background)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-text-primary)] shadow-md">
              <Pencil className="h-3.5 w-3.5" />
              이미지 변경
            </span>
          </div>
        )}
      </div>

      <ImageUploadModal
        open={open}
        onClose={() => setOpen(false)}
        onUploaded={handleUploaded}
        sectionId={sectionId}
        context={context}
      />
    </>
  )
}
