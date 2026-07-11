import { useCallback, useRef, useState } from 'react'

export interface ImageUploadResult {
  url: string
  original_size_kb: number
  optimized_size_kb: number
  width: number
  height: number
  format: string
}

interface ImageUploadProps {
  /** 현재 이미지 URL (있으면 미리보기 노출) */
  value?: string | null
  /** 실제 업로드 처리 — 소비 앱이 API 호출을 담당 (axios onUploadProgress 등) */
  onUpload: (file: File, onProgress: (percent: number) => void) => Promise<ImageUploadResult>
  /** 이미지 삭제 콜백 (없으면 삭제 버튼 미노출) */
  onRemove?: () => void
  /** 최대 파일 크기 (MB). 기본 20 */
  maxSizeMb?: number
  /** 허용 MIME 타입. 기본: jpeg/png/webp/gif */
  accept?: string[]
  disabled?: boolean
}

const DEFAULT_ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function formatSize(kb: number): string {
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)}MB`
  return `${Math.round(kb)}KB`
}

export function ImageUpload({
  value,
  onUpload,
  onRemove,
  maxSizeMb = 20,
  accept = DEFAULT_ACCEPT,
  disabled = false,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImageUploadResult | null>(null)

  const isUploading = progress !== null

  const validate = useCallback(
    (file: File): string | null => {
      if (!accept.includes(file.type)) {
        return '지원하지 않는 이미지 형식입니다. (JPG, PNG, WebP, GIF)'
      }
      if (file.size > maxSizeMb * 1024 * 1024) {
        return `파일이 너무 큽니다. 최대 ${maxSizeMb}MB까지 업로드할 수 있습니다.`
      }
      return null
    },
    [accept, maxSizeMb]
  )

  const handleFile = useCallback(
    async (file: File) => {
      setError(null)
      setResult(null)

      const validationError = validate(file)
      if (validationError) {
        setError(validationError)
        return
      }

      setProgress(0)
      try {
        const uploaded = await onUpload(file, (percent) => {
          setProgress(Math.min(100, Math.max(0, Math.round(percent))))
        })
        setResult(uploaded)
      } catch {
        setError('업로드에 실패했습니다. 다시 시도해 주세요.')
      } finally {
        setProgress(null)
      }
    },
    [onUpload, validate]
  )

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // 같은 파일 재선택 허용
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    if (disabled || isUploading) return
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const openPicker = () => {
    if (disabled || isUploading) return
    inputRef.current?.click()
  }

  const previewUrl = result?.url ?? value ?? null

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="file"
        accept={accept.join(',')}
        className="sr-only"
        onChange={onInputChange}
        disabled={disabled}
        data-testid="image-upload-input"
      />

      {previewUrl ? (
        <div className="relative inline-block">
          <img
            src={previewUrl}
            alt="업로드된 이미지 미리보기"
            className="max-h-48 rounded-lg border border-slate-200 object-contain"
          />
          {onRemove && !isUploading && (
            <button
              type="button"
              onClick={onRemove}
              disabled={disabled}
              aria-label="이미지 삭제"
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white shadow hover:bg-red-700 disabled:bg-red-300"
            >
              ×
            </button>
          )}
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={openPicker}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              openPicker()
            }
          }}
          onDragOver={(e) => {
            e.preventDefault()
            if (!disabled && !isUploading) setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={[
            'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
            disabled || isUploading
              ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300'
              : isDragging
                ? 'cursor-pointer border-blue-500 bg-blue-50 text-blue-600'
                : 'cursor-pointer border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-500',
          ].join(' ')}
        >
          <span className="text-sm font-medium">이미지를 여기로 드래그하거나 클릭하여 선택</span>
          <span className="text-xs text-slate-400">JPG, PNG, WebP, GIF · 최대 {maxSizeMb}MB</span>
        </div>
      )}

      {isUploading && (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-150"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">업로드 중… {progress}%</p>
        </div>
      )}

      {result && !isUploading && (
        <p className="mt-2 text-xs font-medium text-emerald-600">
          {formatSize(result.original_size_kb)} → {formatSize(result.optimized_size_kb)}로 최적화
        </p>
      )}

      {error && (
        <p className="mt-2 text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
