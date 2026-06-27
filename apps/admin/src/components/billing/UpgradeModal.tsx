import { Sparkles } from 'lucide-react'
import { Button, Modal } from '@cms/ui'

interface UpgradeModalProps {
  open: boolean
  onClose: () => void
  /** 한도 초과/미지원이 발생한 기능 이름 (예: "AI 문구 추천") */
  featureName: string
  /** 권장 플랜 이름 (예: "Standard") */
  recommendedPlan: string
  onUpgrade: () => void
}

/** AI 기능 한도 초과 또는 미지원 시 업그레이드를 안내하는 모달 */
export function UpgradeModal({
  open,
  onClose,
  featureName,
  recommendedPlan,
  onUpgrade,
}: UpgradeModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="플랜 업그레이드 안내" size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-600">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-900">
              {featureName}을(를) 더 사용하시려면 업그레이드가 필요합니다.
            </p>
            <p className="text-sm text-slate-500">
              <span className="font-semibold text-violet-600">
                {recommendedPlan}
              </span>{' '}
              플랜으로 업그레이드하면 더 많은 AI 사용량을 이용할 수 있습니다.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            나중에
          </Button>
          <Button onClick={onUpgrade}>플랜 보러가기</Button>
        </div>
      </div>
    </Modal>
  )
}
