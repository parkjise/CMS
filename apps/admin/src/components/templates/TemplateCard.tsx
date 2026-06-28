import { Check, Eye, Lock } from 'lucide-react'
import { Badge, Button } from '@cms/ui'
import {
  INDUSTRY_LABELS,
  type TemplateItem,
} from '@/hooks/useTemplates'
import { resolveClientAssetUrl } from '@/lib/previewUrl'

interface TemplateCardProps {
  template: TemplateItem
  isCurrent: boolean
  onApply: (template: TemplateItem) => void
  onPreview: (template: TemplateItem) => void
}

export function TemplateCard({
  template,
  isCurrent,
  onApply,
  onPreview,
}: TemplateCardProps) {
  const thumb = resolveClientAssetUrl(template.thumbnail_url)

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      {/* 썸네일 */}
      <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
        {thumb ? (
          <img
            src={thumb}
            alt={`${template.name} 미리보기 썸네일`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            미리보기 없음
          </div>
        )}

        {isCurrent && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">
            <Check className="h-3 w-3" /> 적용 중
          </span>
        )}

        {template.locked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-900/55 text-white">
            <Lock className="h-5 w-5" />
            <span className="text-xs font-medium">
              {template.min_plan} 플랜 전용
            </span>
          </div>
        )}
      </div>

      {/* 본문 */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">
            {template.name}
          </h3>
          <Badge variant="default">
            {INDUSTRY_LABELS[template.template_type]}
          </Badge>
        </div>
        {template.description && (
          <p className="line-clamp-2 text-xs text-slate-500">
            {template.description}
          </p>
        )}

        <div className="mt-auto flex gap-2 pt-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => onPreview(template)}
          >
            <Eye className="mr-1 h-4 w-4" /> 미리보기
          </Button>
          <Button
            className="flex-1"
            disabled={template.locked || isCurrent}
            onClick={() => onApply(template)}
          >
            {isCurrent ? '적용 중' : '적용하기'}
          </Button>
        </div>
      </div>
    </div>
  )
}
