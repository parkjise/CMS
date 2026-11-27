import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import type { BoardField, BodyNode } from '@cms/types'
import { Button, Input, Textarea, toast } from '@cms/ui'
import { RichTextEditor } from '@/components/boards/RichTextEditor'
import { CustomFieldInputs } from '@/components/boards/CustomFieldInputs'
import { ImageUploadField } from '@/components/content/forms/ImageUploadField'
import { TagInput } from '@/components/contents/TagInput'
import { LeaveGuard } from '@/components/site/LeaveGuard'
import { useCanEdit } from '@/hooks/useCanEdit'
import {
  type ContentItem,
  type ContentItemInput,
  type ContentStatus,
  flattenCategories,
  useContentCategories,
  useContentItem,
  useContentTags,
  useCreateContentItem,
  useUpdateContentItem,
} from '@/hooks/useContentItems'
import { type ContentType, useContentType, useContentTypes } from '@/hooks/useContentTypes'
import {
  type ContentDraft,
  clearContentDraft,
  contentDraftKey,
  readContentDraft,
  writeContentDraft,
} from '@/lib/contentDraft'
import {
  type CustomValues,
  initialCustomValues,
  toCustomData,
  validateCustomValues,
} from '@/lib/customFields'
import { pickErrorField, pickErrorMessage } from '@/lib/errorMessages'

const TITLE_MAX = 100
const SUMMARY_MAX = 300
// 입력을 멈추고 이만큼 지나면 브라우저에 보관한다
const AUTOSAVE_DELAY_MS = 2000

/** 유형 칸 → 게시판 칸 모양 (입력칸 · 값 검사를 게시글과 함께 쓴다) */
const asBoardFields = (type: ContentType): BoardField[] =>
  type.fields.map((f) => ({
    id: f.id,
    board_id: type.id,
    field_key: f.field_key,
    label: f.label,
    field_type: f.field_type,
    is_required: f.is_required,
    is_visible: true,
    help_text: f.help_text,
    placeholder: f.placeholder,
    default_value: f.default_value,
    options: f.field_options.choices ?? [],
    min: f.field_options.min ?? null,
    max: f.field_options.max ?? null,
    show_in_list: false,
    display_order: f.display_order,
    deleted_at: null,
    value_count: 0,
  }))

/** 콘텐츠 작성 · 수정 (T-256, 기획서 CM-02) — /admin/contents/new?type= · /admin/contents/{id} */
export function ContentItemEditPage() {
  const { itemId } = useParams()
  const [params, setParams] = useSearchParams()
  const item = useContentItem(itemId)
  const types = useContentTypes().data
  const typeId = item.data?.type.id ?? params.get('type') ?? ''
  const type = useContentType(typeId || undefined)

  const back = (
    <Link
      to="/admin/contents"
      className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      콘텐츠 목록
    </Link>
  )

  if (itemId && item.isError) {
    return (
      <div className="space-y-6 p-6 md:p-8">
        {back}
        <p className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          콘텐츠를 찾을 수 없습니다. 목록에서 다시 골라 주세요.
        </p>
      </div>
    )
  }

  if (!itemId && !typeId) {
    return (
      <div className="space-y-6 p-6 md:p-8">
        {back}
        <h1 className="text-2xl font-bold text-slate-900">콘텐츠 작성</h1>
        <label className="block max-w-sm text-sm">
          <span className="mb-1 block font-medium text-slate-700">어떤 콘텐츠를 쓸까요?</span>
          <select
            aria-label="유형 고르기"
            defaultValue=""
            onChange={(e) =>
              setParams((p) => {
                p.set('type', e.target.value)
                return p
              })
            }
            className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
          >
            <option value="" disabled>
              유형을 골라 주세요
            </option>
            {types?.types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    )
  }

  if ((itemId && !item.data) || !type.data) {
    return (
      <div className="space-y-6 p-6 md:p-8">
        {back}
        {type.isError ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            콘텐츠 유형을 찾을 수 없습니다.
          </p>
        ) : (
          <div className="h-64 animate-pulse rounded-lg bg-slate-100" />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6 md:p-8">
      {back}
      <ContentForm key={item.data?.id ?? 'new'} type={type.data} item={item.data} />
    </div>
  )
}

interface ContentFormProps {
  type: ContentType
  item?: ContentItem
}

function ContentForm({ type, item }: ContentFormProps) {
  const navigate = useNavigate()
  const canEdit = useCanEdit()
  const create = useCreateContentItem()
  const update = useUpdateContentItem()
  const fields = useMemo(() => asBoardFields(type), [type])
  const categories = flattenCategories(useContentCategories(type.id).data ?? [])
  const tagNames = (useContentTags().data ?? []).map((t) => t.name)

  const [title, setTitle] = useState(item?.title ?? '')
  const [summary, setSummary] = useState(item?.summary ?? '')
  const [thumbnail, setThumbnail] = useState(item?.thumbnail_url ?? '')
  const [categoryId, setCategoryId] = useState(item?.category_id ?? '')
  const [tags, setTags] = useState<string[]>(item?.tags.map((t) => t.name) ?? [])
  const [body, setBody] = useState<BodyNode[]>(item?.body ?? [])
  const [editorInitial, setEditorInitial] = useState<BodyNode[]>(item?.body ?? [])
  const [editorKey, setEditorKey] = useState(0)
  const [errors, setErrors] = useState<{ title?: string; thumbnail?: string }>({})
  const [dirty, setDirty] = useState(false)
  const [autosavedAt, setAutosavedAt] = useState<string>()
  const custom = useForm<CustomValues>({
    defaultValues: initialCustomValues(fields, item ? item.data : null),
  })

  // 브라우저 보관본 — 그 뒤 다른 곳에서 저장했으면 보관본이 더 낡았다
  const storageKey = contentDraftKey(type.id, item?.id)
  const [pendingDraft, setPendingDraft] = useState<ContentDraft | null>(() => {
    const draft = readContentDraft(storageKey)
    if (draft && item && dayjs(draft.saved_at).isBefore(item.updated_at)) {
      clearContentDraft(storageKey)
      return null
    }
    return draft
  })
  const [customTick, setCustomTick] = useState(0)
  // 새 콘텐츠를 저장하면 그 주소로 — 저장 안 한 변경 확인이 풀린 뒤에 옮긴다
  const [savedPath, setSavedPath] = useState<string | null>(null)

  useEffect(() => {
    if (savedPath && !dirty) navigate(savedPath, { replace: true })
  }, [savedPath, dirty, navigate])

  useEffect(() => {
    const subscription = custom.watch((_values, { type: changeType }) => {
      if (changeType === 'change') setDirty(true)
      setCustomTick((tick) => tick + 1)
    })
    return () => subscription.unsubscribe()
  }, [custom])

  useEffect(() => {
    if (!canEdit || !dirty || pendingDraft) return undefined
    const timer = setTimeout(() => {
      const savedAt = new Date().toISOString()
      const draft: ContentDraft = {
        saved_at: savedAt,
        title,
        summary,
        body,
        thumbnail_url: thumbnail,
        category_id: categoryId,
        tags,
        data: custom.getValues(),
      }
      if (writeContentDraft(storageKey, draft)) setAutosavedAt(savedAt)
    }, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [canEdit, dirty, pendingDraft, title, summary, body, thumbnail, categoryId, tags, customTick, custom, storageKey])

  const touch = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value)
    setDirty(true)
  }

  const restoreDraft = (draft: ContentDraft) => {
    setTitle(draft.title)
    setSummary(draft.summary)
    setThumbnail(draft.thumbnail_url)
    setCategoryId(draft.category_id)
    setTags(draft.tags)
    setBody(draft.body)
    setEditorInitial(draft.body)
    setEditorKey((k) => k + 1)
    custom.reset({ ...custom.getValues(), ...draft.data })
    setPendingDraft(null)
    setDirty(true)
  }

  const discardDraft = () => {
    clearContentDraft(storageKey)
    setPendingDraft(null)
  }

  const published = item?.status === 'PUBLISHED'
  const saving = create.isPending || update.isPending

  /** target 상태로 저장 — 성공하면 true */
  const save = async (target: ContentStatus): Promise<boolean> => {
    const nextErrors: typeof errors = {}
    if (!title.trim()) nextErrors.title = '제목을 입력해 주세요.'
    setErrors(nextErrors)
    const values = custom.getValues()
    const fieldErrors = validateCustomValues(fields, values, {
      publishing: target === 'PUBLISHED',
      first: true,
      stored: {},
    })
    custom.clearErrors()
    for (const [key, message] of Object.entries(fieldErrors)) custom.setError(key, { message })
    if (Object.keys(nextErrors).length || Object.keys(fieldErrors).length) {
      toast.error('입력한 내용을 확인해 주세요.')
      return false
    }
    const input: ContentItemInput = {
      title: title.trim(),
      summary: summary.trim(),
      body,
      data: toCustomData(fields, values),
      thumbnail_url: thumbnail || null,
      category_id: categoryId || null,
      tags,
      status: target,
    }
    try {
      const saved = item
        ? await update.mutateAsync({ id: item.id, ...input })
        : await create.mutateAsync({ ...input, type_id: type.id })
      clearContentDraft(storageKey)
      setDirty(false)
      toast.success(target === 'PUBLISHED' ? '공개했어요.' : '초안으로 저장했어요.')
      if (!item) setSavedPath(`/admin/contents/${saved.id}`)
      return true
    } catch (err) {
      const field = pickErrorField(err)
      const message = pickErrorMessage(err, '저장하지 못했어요.')
      if (field?.startsWith('data.')) custom.setError(field.slice(5), { message })
      else if (field === 'title') setErrors({ title: message })
      else if (field === 'thumbnail_url') setErrors({ thumbnail: message })
      toast.error(message)
      return false
    }
  }

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {item ? '콘텐츠 수정' : '콘텐츠 작성'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {type.name}
            {item && (published ? ' · 공개 중' : ' · 초안')}
            {autosavedAt && ` · 이 브라우저에 ${dayjs(autosavedAt).format('HH:mm')} 보관`}
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            {published ? (
              <>
                <Button type="button" variant="secondary" disabled={saving} onClick={() => void save('DRAFT')}>
                  초안으로 돌리기
                </Button>
                <Button type="button" loading={saving} onClick={() => void save('PUBLISHED')}>
                  저장
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="secondary" disabled={saving} onClick={() => void save('DRAFT')}>
                  초안 저장
                </Button>
                <Button type="button" loading={saving} onClick={() => void save('PUBLISHED')}>
                  공개
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {pendingDraft && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
          role="note"
        >
          <span>
            {dayjs(pendingDraft.saved_at).format('MM.DD HH:mm')}에 저장하지 않고 나간 내용이 이
            브라우저에 있어요.
          </span>
          <span className="flex gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={discardDraft}>
              버리기
            </Button>
            <Button type="button" size="sm" onClick={() => restoreDraft(pendingDraft)}>
              불러오기
            </Button>
          </span>
        </div>
      )}

      <fieldset disabled={!canEdit} className="space-y-5 rounded-lg border border-slate-200 bg-white p-5">
        <Input
          label="제목"
          value={title}
          maxLength={TITLE_MAX}
          error={errors.title}
          onChange={(e) => touch(setTitle)(e.target.value)}
        />
        <Textarea
          label="요약"
          value={summary}
          maxLength={SUMMARY_MAX}
          rows={2}
          helperText="카드 · 목록에 보이는 짧은 설명이에요."
          onChange={(e) => touch(setSummary)(e.target.value)}
        />
        <div>
          <ImageUploadField
            label="대표 사진"
            value={thumbnail}
            context="board"
            onChange={touch(setThumbnail)}
          />
          {errors.thumbnail && (
            <p role="alert" className="mt-1.5 text-sm text-red-600">
              {errors.thumbnail}
            </p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">카테고리</span>
            <select
              value={categoryId}
              onChange={(e) => touch(setCategoryId)(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">카테고리 없음</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <TagInput
            value={tags}
            onChange={touch(setTags)}
            suggestions={tagNames}
            disabled={!canEdit}
          />
        </div>
        {fields.length > 0 && (
          <div className="space-y-4 border-t border-slate-100 pt-4">
            <p className="text-sm font-medium text-slate-700">{type.name} 칸</p>
            <CustomFieldInputs
              fields={fields}
              control={custom.control}
              errors={custom.formState.errors}
              clearError={custom.clearErrors}
            />
          </div>
        )}
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">본문</p>
          <RichTextEditor
            key={editorKey}
            initial={editorInitial}
            editable={canEdit}
            onChange={(next) => {
              // 편집기가 처음 알리는 값은 정리된 처음 내용 — 고친 것으로 보지 않는다
              if (JSON.stringify(next) !== JSON.stringify(body)) setDirty(true)
              setBody(next)
            }}
          />
        </div>
      </fieldset>

      <LeaveGuard dirty={dirty} onSave={() => save(item?.status ?? 'DRAFT')} />
    </>
  )
}
