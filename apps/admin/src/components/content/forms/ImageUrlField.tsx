import { ImageOff } from 'lucide-react'
import { Input } from '@cms/ui'
import { FormField } from './FormField'

interface ImageUrlFieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  hint?: string
}

export function ImageUrlField({
  label,
  value,
  onChange,
  hint,
}: ImageUrlFieldProps) {
  return (
    <FormField
      label={label}
      hint={hint ?? '이미지 URL을 직접 입력하세요. 드래그앤드롭 업로드는 곧 제공됩니다.'}
    >
      <div className="flex items-stretch gap-3">
        <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">
          {value ? (
            <img
              src={value}
              alt="미리보기"
              className="h-full w-full object-cover"
              onError={(e) => {
                ;(e.currentTarget as HTMLImageElement).style.display = 'none'
              }}
            />
          ) : (
            <ImageOff className="h-6 w-6 text-slate-300" />
          )}
        </div>
        <Input
          type="url"
          placeholder="https://..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1"
        />
      </div>
    </FormField>
  )
}
