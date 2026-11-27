import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { Button, Input, toast } from '@cms/ui'
import { ContentFieldsEditor } from '@/components/contents/ContentFieldsEditor'
import { useCanEdit } from '@/hooks/useCanEdit'
import {
  type ContentType,
  useContentType,
  useUpdateContentType,
} from '@/hooks/useContentTypes'
import { pickErrorField, pickErrorMessage } from '@/lib/errorMessages'

/** 콘텐츠 유형 편집 (T-255, 기획서 CM-03) — 이름 · 키 · 설명과 칸 */
export function ContentTypeDetailPage() {
  const { typeId } = useParams()
  const canEdit = useCanEdit()
  const { data: type, isLoading, isError } = useContentType(typeId)

  return (
    <div className="space-y-6 p-6 md:p-8">
      <Link
        to="/admin/contents/types"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        콘텐츠 유형
      </Link>
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-lg bg-slate-100" />
      ) : isError || !type ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          유형을 찾을 수 없습니다. 목록에서 다시 골라 주세요.
        </div>
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{type.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              콘텐츠 {type.item_count}개 (공개 {type.published_count}) — 제목 · 요약 · 본문 · 대표
              사진 · 카테고리 · 태그는 모든 유형에 기본으로 있어요.
            </p>
          </div>
          <TypeInfoForm key={type.updated_at} type={type} editable={canEdit} />
          <ContentFieldsEditor key={`fields-${type.updated_at}`} type={type} editable={canEdit} />
        </>
      )}
    </div>
  )
}

function TypeInfoForm({ type, editable }: { type: ContentType; editable: boolean }) {
  const update = useUpdateContentType()
  const [name, setName] = useState(type.name)
  const [typeKey, setTypeKey] = useState(type.type_key)
  const [description, setDescription] = useState(type.description)
  const [errors, setErrors] = useState<{ name?: string; type_key?: string }>({})
  const dirty =
    name !== type.name || typeKey !== type.type_key || description !== type.description

  useEffect(() => setErrors({}), [name, typeKey])

  const save = () => {
    update.mutate(
      {
        id: type.id,
        ...(name !== type.name ? { name: name.trim() } : {}),
        ...(typeKey !== type.type_key ? { type_key: typeKey } : {}),
        ...(description !== type.description ? { description: description.trim() } : {}),
      },
      {
        onSuccess: () => toast.success('유형 정보를 저장했어요.'),
        onError: (err) => {
          const field = pickErrorField(err)
          const message = pickErrorMessage(err, '유형 정보를 저장하지 못했어요.')
          if (field === 'name' || field === 'type_key') setErrors({ [field]: message })
          else toast.error(message)
        },
      }
    )
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">기본 정보</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="유형 이름"
          value={name}
          maxLength={40}
          disabled={!editable}
          error={errors.name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label="유형 키"
          value={typeKey}
          maxLength={40}
          disabled={!editable}
          helperText="홈페이지 연결에 쓰는 이름이에요. 바꾸면 연결된 섹션도 새 키를 써야 해요."
          error={errors.type_key}
          onChange={(e) => setTypeKey(e.target.value.trim().toLowerCase())}
        />
      </div>
      <Input
        label="설명"
        value={description}
        maxLength={200}
        disabled={!editable}
        onChange={(e) => setDescription(e.target.value)}
      />
      {editable && (
        <div className="flex justify-end">
          <Button type="button" disabled={!dirty} loading={update.isPending} onClick={save}>
            기본 정보 저장
          </Button>
        </div>
      )}
    </section>
  )
}
