import { useEffect, useState } from 'react'
import { Button, Modal } from '@cms/ui'
import type { ContentMode, TemplateItem } from '@/hooks/useTemplates'

interface ApplyConfirmDialogProps {
  template: TemplateItem | null
  isApplying: boolean
  onConfirm: (contentMode: ContentMode) => void
  onClose: () => void
}

/**
 * 템플릿 적용 확인 (AD-06, 기획서 11.8)
 * - 기본: 내 콘텐츠 유지 (디자인만 교체, 코드형은 새 템플릿에만 있는 섹션을 샘플로 추가)
 * - 샘플이 있는 템플릿: '샘플로 교체' 선택 가능 → 경고 문구 + 버튼 문구 변경
 */
export function ApplyConfirmDialog({
  template,
  isApplying,
  onConfirm,
  onClose,
}: ApplyConfirmDialogProps) {
  const [mode, setMode] = useState<ContentMode>('keep')
  const canReplace = Boolean(template?.has_sample_content)
  const isCode = template?.renderer === 'code'

  // 다른 템플릿을 열면 항상 '유지'부터
  useEffect(() => {
    setMode('keep')
  }, [template?.id])

  const replace = canReplace && mode === 'replace_with_sample'

  return (
    <Modal
      open={template !== null}
      onClose={onClose}
      title="이 템플릿을 적용할까요?"
      size="sm"
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-700">
          <span className="font-semibold">{template?.name}</span> 템플릿을
          적용합니다.
        </p>

        {canReplace && (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium text-slate-900">
              지금 홈페이지 내용은 어떻게 할까요?
            </legend>
            <label className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 p-3 text-sm has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
              <input
                type="radio"
                name="content-mode"
                value="keep"
                checked={mode === 'keep'}
                onChange={() => setMode('keep')}
                className="mt-0.5"
              />
              <span>
                <span className="block font-medium text-slate-900">
                  내 콘텐츠 유지 (추천)
                </span>
                <span className="text-slate-600">
                  작성한 문구·이미지는 그대로 두고 디자인만 바꿉니다.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 p-3 text-sm has-[:checked]:border-rose-500 has-[:checked]:bg-rose-50">
              <input
                type="radio"
                name="content-mode"
                value="replace_with_sample"
                checked={mode === 'replace_with_sample'}
                onChange={() => setMode('replace_with_sample')}
                className="mt-0.5"
              />
              <span>
                <span className="block font-medium text-slate-900">
                  템플릿 샘플로 교체
                </span>
                <span className="text-slate-600">
                  템플릿 디자인에 맞춘 샘플 문구·이미지로 새로 시작합니다.
                </span>
              </span>
            </label>
          </fieldset>
        )}

        {replace ? (
          <p
            role="alert"
            className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
          >
            지금 홈페이지의 문구·이미지가 템플릿 샘플로 바뀝니다. 기존 내용은
            지워지지 않고 보관되며, [이전 템플릿으로 돌아가기]로 되살릴 수
            있습니다.
          </p>
        ) : (
          <ul className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            <li>· 디자인(색상·폰트·레이아웃)만 바뀝니다.</li>
            <li>· 작성하신 텍스트·이미지 콘텐츠는 그대로 유지됩니다.</li>
            {isCode && (
              <li>· 새 템플릿에만 있는 섹션은 샘플 내용으로 추가됩니다.</li>
            )}
            <li>· 적용 후 언제든 이전 상태로 롤백할 수 있습니다.</li>
          </ul>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={isApplying}>
            취소
          </Button>
          <Button
            variant={replace ? 'danger' : 'primary'}
            onClick={() => onConfirm(replace ? 'replace_with_sample' : 'keep')}
            disabled={isApplying}
          >
            {isApplying ? '적용 중…' : replace ? '샘플로 교체하기' : '적용하기'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
