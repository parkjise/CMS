'use client'

import { useEffect, useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  type ImageContext,
  type UploadResult,
  uploadImage,
  validateImageFile,
} from '@/lib/uploadImage'

interface Props {
  open: boolean
  onClose: () => void
  onUploaded: (url: string, result: UploadResult) => void
  sectionId: string
  context: ImageContext
}

export function ImageUploadModal({
  open,
  onClose,
  onUploaded,
  sectionId,
  context,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !uploading) onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose, uploading])

  useEffect(() => {
    if (!open) {
      setFile(null)
      setPreviewUrl(null)
      setUploading(false)
      setProgress(0)
      setError(null)
      setDragOver(false)
    }
  }, [open])

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  if (!open) return null

  const handleSelect = (next: File | null | undefined) => {
    setError(null)
    if (!next) return
    const v = validateImageFile(next)
    if (v) {
      setError(v.message)
      return
    }
    setFile(next)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    handleSelect(e.dataTransfer.files?.[0])
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const result = await uploadImage(file, sectionId, context, setProgress)
      toast.success(
        `이미지 업로드 완료 (${result.original_size_kb}KB → ${result.optimized_size_kb}KB, WebP)`,
      )
      onUploaded(result.url, result)
      onClose()
    } catch {
      setError('업로드에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-upload-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--color-overlay)] px-4"
      onClick={() => !uploading && onClose()}
    >
      <div
        className="w-full max-w-md rounded-[var(--border-radius-card)] bg-[var(--color-background)] p-6 shadow-[var(--shadow-floating)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2
            id="image-upload-title"
            className="text-base font-semibold text-[color:var(--color-text-primary)]"
          >
            이미지 업로드
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            aria-label="닫기"
            className="text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-primary)] disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={[
            'mt-4 flex aspect-video w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--border-radius-base)] border-2 border-dashed bg-[var(--color-surface)] text-center transition',
            dragOver
              ? 'border-[color:var(--color-primary)] bg-[var(--color-primary)]/5'
              : 'border-[color:var(--color-border-strong)]',
          ].join(' ')}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="미리보기"
              className="h-full w-full object-contain p-2"
            />
          ) : (
            <>
              <Upload className="h-8 w-8 text-[color:var(--color-text-muted)]" />
              <p className="text-sm text-[color:var(--color-text-secondary)]">
                여기에 드래그 또는 클릭해서 선택
              </p>
              <p className="text-xs text-[color:var(--color-text-subtle)]">
                JPG, PNG, WebP · 최대 20MB
              </p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleSelect(e.target.files?.[0])}
          />
        </div>

        {file && !uploading && (
          <p className="mt-3 truncate text-xs text-[color:var(--color-text-muted)]">
            {file.name} · {Math.round(file.size / 1024)}KB
          </p>
        )}

        {uploading && (
          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-strong)]">
              <div
                className="h-full bg-[var(--color-primary)] transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 text-right text-xs text-[color:var(--color-text-muted)]">
              {progress}%
            </p>
          </div>
        )}

        {error && (
          <p className="mt-3 text-xs text-[color:var(--color-danger)]">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="rounded-[var(--border-radius-base)] border border-[color:var(--color-border)] bg-[var(--color-background)] px-4 py-2 text-sm font-medium text-[color:var(--color-text-secondary)] transition hover:bg-[var(--color-surface)] disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || uploading}
            className="rounded-[var(--border-radius-base)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[color:var(--color-on-primary)] transition hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? '업로드 중...' : '업로드'}
          </button>
        </div>
      </div>
    </div>
  )
}
