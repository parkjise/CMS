import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Badge, Button, toast } from '@cms/ui'
import { TemplateFormModal } from '@/components/templates/TemplateFormModal'
import { type SuperTemplate, useSuperTemplates, useUpdateTemplate } from '@/hooks/useTemplates'
import { apiErrorMessage } from '@/lib/errors'
import { TEMPLATE_LABELS } from '@/lib/tenantList'

/** 템플릿 관리 (T-208, 기획서 14.1) — 추가 · 수정 · 공개(배포) · 숨김 */
export function TemplatesPage() {
  const { data, isLoading, isError } = useSuperTemplates()
  const updateMutation = useUpdateTemplate()
  // undefined: 닫힘, null: 새 템플릿
  const [editing, setEditing] = useState<SuperTemplate | null | undefined>(undefined)
  const themes = useMemo(() => (data ?? []).filter((t) => t.renderer === 'theme'), [data])

  const togglePublish = async (t: SuperTemplate) => {
    if (
      t.is_active &&
      t.usage_count > 0 &&
      !window.confirm(
        `'${t.name}'을 숨길까요? 새로 고를 수만 없고, 지금 쓰는 사업체 ${t.usage_count}곳의 홈페이지는 그대로예요.`
      )
    ) {
      return
    }
    try {
      await updateMutation.mutateAsync({ id: t.id, input: { is_active: !t.is_active } })
      toast.success(t.is_active ? '템플릿을 숨겼습니다.' : '템플릿을 공개했습니다.')
    } catch (e) {
      toast.error(apiErrorMessage(e, '바꾸지 못했습니다.'))
    }
  }

  return (
    <div className="p-8">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">템플릿 관리</h1>
          <p className="mt-1 text-sm text-slate-500">
            사업체가 고를 수 있는 템플릿 — 공개 · 숨김, 이름 · 플랜 · 색 수정 (14.1)
          </p>
        </div>
        <Button onClick={() => setEditing(null)}>
          <Plus className="mr-1 h-4 w-4" />새 테마형 템플릿
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-4 py-3">템플릿</th>
              <th className="px-4 py-3">업종</th>
              <th className="px-4 py-3">방식</th>
              <th className="px-4 py-3">최소 플랜</th>
              <th className="px-4 py-3 text-right">쓰는 사업체</th>
              <th className="px-4 py-3">공개</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  불러오는 중…
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-red-500">
                  목록을 불러오지 못했습니다.
                </td>
              </tr>
            )}
            {data?.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{t.name}</div>
                  {t.description && (
                    <div className="max-w-md truncate text-xs text-slate-400">{t.description}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {TEMPLATE_LABELS[t.template_type] ?? t.template_type}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {t.renderer === 'code' ? `코드형 · ${t.code ?? ''}` : '테마형'}
                </td>
                <td className="px-4 py-3">{t.min_plan}</td>
                <td className="px-4 py-3 text-right tabular-nums">{t.usage_count}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => togglePublish(t)}
                    disabled={updateMutation.isPending}
                    aria-label={`${t.name} ${t.is_active ? '숨기기' : '공개하기'}`}
                  >
                    <Badge variant={t.is_active ? 'success' : 'default'} dot>
                      {t.is_active ? '공개' : '숨김'}
                    </Badge>
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => setEditing(t)}
                    className="text-sm font-medium text-indigo-600 hover:underline"
                    aria-label={`${t.name} 수정`}
                  >
                    수정
                  </button>
                </td>
              </tr>
            ))}
            {data && data.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  템플릿이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        숨긴 템플릿은 사업체 템플릿 목록에서 빠지지만, 이미 쓰는 사업체의 홈페이지는 그대로예요.
      </p>

      <TemplateFormModal
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        template={editing ?? null}
        themes={themes}
      />
    </div>
  )
}
