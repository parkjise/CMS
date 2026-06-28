import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button, toast } from '@cms/ui'
import { ApplyConfirmDialog } from '@/components/templates/ApplyConfirmDialog'
import { CustomizePanel } from '@/components/templates/CustomizePanel'
import { IndustryFilterTabs } from '@/components/templates/IndustryFilterTabs'
import { TemplateCard } from '@/components/templates/TemplateCard'
import {
  type IndustryType,
  type TemplateItem,
  useApplyTemplate,
  useCustomizeTemplate,
  useRollbackTemplate,
  useTemplates,
} from '@/hooks/useTemplates'
import { openTemplatePreview } from '@/lib/previewUrl'
import { useAuthStore } from '@/stores/authStore'

export function TemplatesPage() {
  const [industry, setIndustry] = useState<IndustryType | null>(null)
  const [pendingApply, setPendingApply] = useState<TemplateItem | null>(null)

  const tenantSlug = useAuthStore((s) => s.tenantSlug)
  const { data, isLoading } = useTemplates(industry ?? undefined)
  const applyMutation = useApplyTemplate()
  const rollbackMutation = useRollbackTemplate()
  const customizeMutation = useCustomizeTemplate()

  const currentId = data?.current_template_id ?? null
  const hasApplied = currentId !== null

  const currentTemplate = data?.templates.find((t) => t.id === currentId)
  const customizeDefaults = {
    primary: currentTemplate?.css_variables.primary ?? '#1a73e8',
    accent: currentTemplate?.css_variables.accent ?? '#1a73e8',
    font_heading: currentTemplate?.css_variables.font_heading ?? 'Pretendard',
    font_body: currentTemplate?.css_variables.font_body ?? 'Pretendard',
  }

  const handlePreview = (template: TemplateItem) => {
    if (!tenantSlug) {
      toast.error('미리보기를 위한 사이트 정보를 찾을 수 없습니다.')
      return
    }
    openTemplatePreview(tenantSlug, template.id)
  }

  const handleConfirmApply = () => {
    if (!pendingApply) return
    const name = pendingApply.name
    applyMutation.mutate(pendingApply.id, {
      onSuccess: () => {
        toast.success(`'${name}' 템플릿을 적용했습니다.`)
        setPendingApply(null)
      },
    })
  }

  const handleRollback = () => {
    rollbackMutation.mutate(undefined, {
      onSuccess: () => toast.success('이전 템플릿 상태로 롤백했습니다.'),
      onError: () => toast.error('롤백할 변경 이력이 없습니다.'),
    })
  }

  const handleCustomize = (cssOverrides: Record<string, string>) => {
    customizeMutation.mutate(cssOverrides, {
      onSuccess: () => toast.success('커스터마이징을 저장했습니다.'),
    })
  }

  return (
    <div className="space-y-6 p-6 md:p-8">
      {/* 헤더 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">템플릿 선택</h1>
          <p className="mt-1 text-sm text-slate-500">
            홈페이지 디자인을 선택하고 색상·폰트를 조정하세요. 콘텐츠는 그대로
            유지됩니다.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            variant="secondary"
            disabled={!hasApplied || rollbackMutation.isPending}
            onClick={handleRollback}
          >
            <RotateCcw className="mr-1 h-4 w-4" />
            {rollbackMutation.isPending ? '롤백 중…' : '이전 템플릿으로 롤백'}
          </Button>
          <span className="text-xs text-slate-400">
            변경 후 7일 이내 롤백 가능
          </span>
        </div>
      </div>

      {/* 업종 필터 */}
      <IndustryFilterTabs value={industry} onChange={setIndustry} />

      {/* 템플릿 그리드 */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[16/10] animate-pulse rounded-xl bg-slate-100"
            />
          ))}
        </div>
      ) : data && data.templates.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data.templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              isCurrent={template.id === currentId}
              onApply={setPendingApply}
              onPreview={handlePreview}
            />
          ))}
        </div>
      ) : (
        <p className="py-16 text-center text-sm text-slate-500">
          해당 업종의 템플릿이 없습니다.
        </p>
      )}

      {/* 커스터마이징 패널 (현재 템플릿 변경 시 기본값으로 리셋되도록 key 부여) */}
      <CustomizePanel
        key={currentId ?? 'none'}
        disabled={!hasApplied}
        isSaving={customizeMutation.isPending}
        defaults={customizeDefaults}
        onSave={handleCustomize}
      />

      <ApplyConfirmDialog
        template={pendingApply}
        isApplying={applyMutation.isPending}
        onConfirm={handleConfirmApply}
        onClose={() => setPendingApply(null)}
      />
    </div>
  )
}
