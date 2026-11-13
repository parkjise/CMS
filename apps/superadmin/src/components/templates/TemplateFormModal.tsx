import { useEffect, useState } from 'react'
import { Button, Input, Modal, Textarea, toast } from '@cms/ui'
import { type SuperTemplate, useCreateTemplate, useUpdateTemplate } from '@/hooks/useTemplates'
import { apiErrorMessage } from '@/lib/errors'
import { PLAN_ORDER } from '@/lib/plans'
import { TEMPLATE_LABELS } from '@/lib/tenantList'

interface Props {
  open: boolean
  onClose: () => void
  /** 없으면 새 테마형 템플릿 */
  template: SuperTemplate | null
  /** 색 · 글꼴을 가져올 수 있는 테마형 템플릿 */
  themes: SuperTemplate[]
}

const SELECT = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm'
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i

/** 템플릿 추가 · 수정 (T-208) — 코드형은 색 · 글꼴을 여기서 바꾸지 않는다 */
export function TemplateFormModal({ open, onClose, template, themes }: Props) {
  const createMutation = useCreateTemplate()
  const updateMutation = useUpdateTemplate()
  const isNew = template === null
  const isTheme = isNew || template.renderer === 'theme'

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [thumbnail, setThumbnail] = useState('')
  const [minPlan, setMinPlan] = useState('BASIC')
  const [industry, setIndustry] = useState('GENERAL')
  const [baseId, setBaseId] = useState('')
  const [css, setCss] = useState<Record<string, string>>({})
  const [publish, setPublish] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(template?.name ?? '')
    setDescription(template?.description ?? '')
    setThumbnail(template?.thumbnail_url ?? '')
    setMinPlan(template?.min_plan ?? 'BASIC')
    setIndustry(template?.template_type ?? 'GENERAL')
    setBaseId(isNew ? (themes[0]?.id ?? '') : '')
    setCss(template?.css_variables ?? themes[0]?.css_variables ?? {})
    setPublish(false)
  }, [open, template, themes, isNew])

  const pickBase = (id: string) => {
    setBaseId(id)
    setCss(themes.find((t) => t.id === id)?.css_variables ?? {})
  }

  const pending = createMutation.isPending || updateMutation.isPending

  const handleSubmit = async () => {
    try {
      if (isNew) {
        await createMutation.mutateAsync({
          name: name.trim(),
          template_type: industry,
          description: description.trim() || null,
          thumbnail_url: thumbnail.trim() || null,
          min_plan: minPlan,
          base_template_id: baseId || null,
          css_variables: css,
          is_active: publish,
        })
        toast.success(publish ? '템플릿을 만들고 공개했습니다.' : '템플릿을 만들었습니다. (숨김)')
      } else {
        await updateMutation.mutateAsync({
          id: template.id,
          input: {
            name: name.trim(),
            description: description.trim() || null,
            thumbnail_url: thumbnail.trim() || null,
            min_plan: minPlan,
            ...(isTheme ? { css_variables: css } : {}),
          },
        })
        toast.success('템플릿을 저장했습니다.')
      }
      onClose()
    } catch (e) {
      toast.error(apiErrorMessage(e, '저장하지 못했습니다.'))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isNew ? '새 테마형 템플릿' : '템플릿 수정'}
      size="lg"
    >
      <div className="space-y-4">
        {isNew && (
          <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            테마형은 공용 화면에 색 · 글꼴만 바꾼 템플릿이에요. 화면 구성이 다른 코드형 템플릿은
            홈페이지 코드 배포가 필요해 여기서 만들 수 없어요.
          </p>
        )}
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">이름</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">설명</span>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={500}
          />
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {isNew && (
            <label className="block space-y-1">
              <span className="text-sm font-medium text-slate-700">추천 업종</span>
              <select
                className={SELECT}
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              >
                {Object.entries(TEMPLATE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">최소 플랜</span>
            <select className={SELECT} value={minPlan} onChange={(e) => setMinPlan(e.target.value)}>
              {PLAN_ORDER.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">썸네일 주소</span>
          <Input
            value={thumbnail}
            onChange={(e) => setThumbnail(e.target.value)}
            placeholder="/templates/my-theme.svg 또는 https://..."
          />
        </label>

        {isTheme ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700">색 · 글꼴</legend>
            {isNew && (
              <label className="block space-y-1">
                <span className="text-xs text-slate-500">가져올 템플릿</span>
                <select
                  aria-label="가져올 템플릿"
                  className={SELECT}
                  value={baseId}
                  onChange={(e) => pickBase(e.target.value)}
                >
                  {themes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="space-y-2">
              {Object.entries(css).map(([key, value]) => (
                <label key={key} className="flex items-center gap-2 text-xs text-slate-600">
                  {/* 색 값만 견본을 그린다 — 글꼴 · 크기는 빈칸 */}
                  <span
                    aria-hidden
                    className="h-5 w-5 shrink-0 rounded border border-slate-200"
                    style={COLOR.test(value) ? { background: value } : undefined}
                  />
                  <span className="w-32 shrink-0 truncate">{key}</span>
                  <Input
                    aria-label={`${key} 값`}
                    value={value}
                    onChange={(e) => setCss((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <p className="text-xs text-slate-500">
            코드형 템플릿의 색 · 글꼴은 템플릿 코드에서 바꿔요. 여기서는 이름 · 설명 · 플랜 · 공개만
            바꿀 수 있어요.
          </p>
        )}

        {isNew && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={publish}
              onChange={(e) => setPublish(e.target.checked)}
            />
            바로 공개 (끄면 숨긴 채로 만들어 확인한 뒤 공개)
          </label>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={pending || !name.trim()}>
            {pending ? '저장 중...' : isNew ? '만들기' : '저장'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
