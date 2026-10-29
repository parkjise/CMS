import { useEffect, useState } from 'react'
import { Building2, Clock, ImageIcon } from 'lucide-react'
import { Button, Input, toast } from '@cms/ui'
import { FormField } from '@/components/content/forms/FormField'
import { ImageUploadField } from '@/components/content/forms/ImageUploadField'
import {
  type SiteSettings,
  type SiteSettingsField,
  useSiteSettings,
  useUpdateSiteSettings,
} from '@/hooks/useSiteSettings'
import { pickErrorMessage } from '@/lib/errorMessages'

/**
 * 콘텐츠 편집 → 공통 설정 (기획서 AD-02-A, T-036-A)
 * 사업체 정보 · 로고 · 파비콘을 한 번만 입력하면 홈페이지 푸터 · 상담 버튼 · 브라우저 탭 ·
 * 검색 구조화 데이터에 함께 쓰인다.
 */

type Draft = Record<SiteSettingsField, string>

const FIELDS: SiteSettingsField[] = [
  'phone',
  'email',
  'address',
  'address_detail',
  'hours_weekday',
  'hours_saturday',
  'hours_note',
  'parking',
  'ceo',
  'business_number',
  'logo_url',
  'favicon_url',
]

const toDraft = (s: SiteSettings | null | undefined): Draft =>
  Object.fromEntries(FIELDS.map((f) => [f, s?.[f] ?? ''])) as Draft

interface TextFieldProps {
  field: SiteSettingsField
  label: string
  placeholder?: string
  hint?: string
  type?: string
  draft: Draft
  error?: string
  onChange: (field: SiteSettingsField, value: string) => void
}

function TextField({ field, label, placeholder, hint, type, draft, error, onChange }: TextFieldProps) {
  const id = `site-${field}`
  return (
    <FormField label={label} htmlFor={id} hint={error ? undefined : hint}>
      {/* Input 의 error — 빨간 테두리 · aria-invalid · 아래 안내 문구 */}
      <Input
        id={id}
        type={type}
        value={draft[field]}
        placeholder={placeholder}
        error={error}
        onChange={(e) => onChange(field, e.target.value)}
      />
    </FormField>
  )
}

/** 400 응답의 칸 이름 · 메시지 */
const fieldError = (err: unknown): { field: string; message: string } | null => {
  const body = (err as { response?: { data?: { error?: { field?: string; message?: string } } } })
    ?.response?.data?.error
  return body?.field && body.message ? { field: body.field, message: body.message } : null
}

export function SiteSettingsForm() {
  const query = useSiteSettings()
  const save = useUpdateSiteSettings()
  const [draft, setDraft] = useState<Draft>(() => toDraft(null))
  const [errors, setErrors] = useState<Partial<Record<SiteSettingsField, string>>>({})

  useEffect(() => {
    if (query.data !== undefined) setDraft(toDraft(query.data))
  }, [query.data])

  const change = (field: SiteSettingsField, value: string) => {
    setDraft((d) => ({ ...d, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }

  const handleSave = () =>
    save.mutate(draft, {
      onSuccess: () => {
        setErrors({})
        toast.success('공통 설정을 저장했습니다. 홈페이지에 바로 반영돼요.')
      },
      onError: (err) => {
        const fe = fieldError(err)
        if (fe && (FIELDS as string[]).includes(fe.field)) {
          setErrors({ [fe.field]: fe.message })
          document.getElementById(`site-${fe.field}`)?.focus()
        }
        toast.error(pickErrorMessage(err, '저장하지 못했습니다.'))
      },
    })

  if (query.isLoading) {
    return <div role="status" aria-label="공통 설정 불러오는 중" className="h-96 animate-pulse rounded-lg bg-slate-100" />
  }

  const common = { draft, onChange: change }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        handleSave()
      }}
    >
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Building2 className="h-4 w-4 text-slate-500" aria-hidden="true" /> 사업체 정보
        </h2>
        <p className="text-sm text-slate-500">
          홈페이지 아래쪽(푸터) · 상담 버튼 · 검색 결과 정보에 함께 쓰여요. 비워 둔 칸은 홈페이지에
          보이지 않습니다.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField {...common} field="phone" label="대표 전화" placeholder="02-1234-5678" error={errors.phone} />
          <TextField {...common} field="email" label="이메일" type="email" placeholder="hello@example.com" error={errors.email} />
          <TextField {...common} field="address" label="주소" placeholder="서울특별시 강남구 테헤란로 123" error={errors.address} />
          <TextField {...common} field="address_detail" label="상세 주소" placeholder="4층" error={errors.address_detail} />
          <TextField {...common} field="ceo" label="대표자" placeholder="홍길동" error={errors.ceo} />
          <TextField
            {...common}
            field="business_number"
            label="사업자등록번호"
            placeholder="123-45-67890"
            hint="숫자 10자리 — 하이픈은 자동으로 넣어요."
            error={errors.business_number}
          />
        </div>
        <TextField {...common} field="parking" label="주차 안내" placeholder="건물 내 주차 2시간 무료" error={errors.parking} />
      </section>

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Clock className="h-4 w-4 text-slate-500" aria-hidden="true" /> 영업시간
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField {...common} field="hours_weekday" label="평일" placeholder="오전 9:00 - 오후 6:00" error={errors.hours_weekday} />
          <TextField {...common} field="hours_saturday" label="토요일" placeholder="오전 9:00 - 오후 1:00" error={errors.hours_saturday} />
        </div>
        <TextField {...common} field="hours_note" label="휴무 안내" placeholder="일요일 · 공휴일 휴무" error={errors.hours_note} />
      </section>

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <ImageIcon className="h-4 w-4 text-slate-500" aria-hidden="true" /> 로고 · 파비콘
        </h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <ImageUploadField
            label="로고"
            context="site"
            value={draft.logo_url}
            onChange={(url) => change('logo_url', url)}
            hint="홈페이지 맨 위에 상호 대신 보여요. 가로로 긴 이미지(예: 400×120)를 권장해요."
          />
          <ImageUploadField
            label="파비콘 (브라우저 탭 아이콘)"
            context="site"
            value={draft.favicon_url}
            onChange={(url) => change('favicon_url', url)}
            hint="정사각형 이미지(예: 512×512)를 권장해요."
          />
        </div>
        {(errors.logo_url || errors.favicon_url) && (
          <p className="text-xs text-rose-600" role="alert">
            {errors.logo_url ?? errors.favicon_url}
          </p>
        )}
      </section>

      <div className="flex justify-end">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? '저장 중…' : '공통 설정 저장'}
        </Button>
      </div>
    </form>
  )
}
