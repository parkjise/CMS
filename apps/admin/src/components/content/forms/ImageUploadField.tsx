import { useId, useRef, useState } from 'react'
import { ImageOff, Link2, Loader2, Trash2, UploadCloud } from 'lucide-react'
import { Input, toast } from '@cms/ui'
import { FormField } from './FormField'
import { type ImageContext, useUploadImage } from '@/hooks/useUploadImage'
import { ACCEPTED_TYPES, LARGE_IMAGE_BYTES, checkImageFile, formatKb } from '@/lib/imageFile'
import { pickErrorMessage } from '@/lib/errorMessages'

// 섹션 이미지 업로드 — 끌어다 놓기 · 파일 선택 (기획서 AD-02-B, T-037-B)
// 서버가 WebP 로 최적화한 주소를 폼 값으로 넣는다 — 저장은 폼의 [변경사항 저장] 으로.

interface ImageUploadFieldProps {
  label: string
  value: string
  onChange: (url: string) => void
  sectionId: string
  context: ImageContext
  hint?: string
}

export function ImageUploadField({
  label,
  value,
  onChange,
  sectionId,
  context,
  hint,
}: ImageUploadFieldProps) {
  const upload = useUploadImage()
  const fileInput = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [showUrl, setShowUrl] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const inputId = useId()

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    const problem = checkImageFile(file)
    if (problem) {
      toast.error(problem)
      return
    }
    if (file.size > LARGE_IMAGE_BYTES) {
      toast.info('이미지가 큽니다. 자동으로 최적화됩니다.')
    }
    setResult(null)
    try {
      const uploaded = await upload.mutateAsync({ file, sectionId, context })
      onChange(uploaded.url)
      const summary = `${formatKb(uploaded.original_size_kb)} → ${formatKb(uploaded.optimized_size_kb)}로 최적화되었습니다.`
      setResult(summary)
      toast.success(`${summary} 저장을 눌러 반영하세요.`)
    } catch (err) {
      toast.error(pickErrorMessage(err, '이미지를 올리지 못했습니다. 다시 시도해주세요.'))
    }
  }

  const uploading = upload.isPending

  return (
    <FormField label={label} hint={hint}>
      <div className="space-y-2">
        <div
          role="button"
          tabIndex={0}
          aria-label={`${label} 업로드 — 끌어다 놓거나 눌러서 파일 선택`}
          aria-busy={uploading}
          onClick={() => !uploading && fileInput.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !uploading) {
              e.preventDefault()
              fileInput.current?.click()
            }
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            if (!uploading) void handleFile(e.dataTransfer.files[0])
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition ${
            dragOver
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300'
          }`}
        >
          {uploading ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" aria-hidden="true" />
              <span>올리는 중… 자동으로 최적화하고 있어요</span>
            </>
          ) : (
            <>
              <UploadCloud className="h-6 w-6" aria-hidden="true" />
              <span>
                이미지를 여기에 끌어다 놓거나 <span className="font-medium text-blue-600">파일 선택</span>
              </span>
              <span className="text-xs text-slate-400">JPG, PNG, WebP, GIF / 최대 20MB</span>
            </>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          className="hidden"
          data-testid={`${context}-file-input`}
          onChange={(e) => {
            void handleFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />

        {result && (
          <p className="text-xs text-emerald-700" role="status">
            ✅ {result}
          </p>
        )}

        {value ? (
          <div className="flex items-center gap-3 rounded-md border border-slate-200 p-2">
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="h-14 w-20 flex-shrink-0 overflow-hidden rounded bg-slate-100"
              aria-label="현재 이미지 크게 보기"
            >
              <img
                src={value}
                alt="현재 이미지"
                className="h-full w-full object-cover"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                }}
              />
            </a>
            <span className="min-w-0 flex-1 truncate text-xs text-slate-500" title={value}>
              {value.split('/').pop()}
            </span>
            <button
              type="button"
              onClick={() => {
                onChange('')
                setResult(null)
              }}
              className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              aria-label={`${label} 삭제`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <ImageOff className="h-3.5 w-3.5" aria-hidden="true" /> 등록된 이미지가 없습니다.
          </p>
        )}

        <button
          type="button"
          onClick={() => setShowUrl((v) => !v)}
          aria-expanded={showUrl}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          주소로 넣기
        </button>
        {showUrl && (
          <Input
            id={inputId}
            type="url"
            aria-label={`${label} 주소`}
            placeholder="https://..."
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </div>
    </FormField>
  )
}
