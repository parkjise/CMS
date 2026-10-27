import { useEffect, useState } from 'react'
import { Button, Input, Modal, toast } from '@cms/ui'
import { type SectionLimits, useCreateSection } from '@/hooks/useSections'
import { pickErrorMessage } from '@/lib/errorMessages'

interface AddSectionModalProps {
  open: boolean
  limits: SectionLimits
  onClose: () => void
}

/** 섹션 추가 — 종류는 서버가 알려 준 addable_types 중에서 (기획서 AD-02, T-037-A) */
export function AddSectionModal({ open, limits, onClose }: AddSectionModalProps) {
  const create = useCreateSection()
  const [sectionType, setSectionType] = useState('')
  const [label, setLabel] = useState('')

  useEffect(() => {
    if (open) {
      setSectionType(limits.addable_types[0]?.section_type ?? '')
      setLabel('')
    }
  }, [open, limits.addable_types])

  const handleSubmit = () => {
    if (!sectionType) return
    create.mutate(
      { section_type: sectionType, label: label.trim() || undefined },
      {
        onSuccess: (section) => {
          toast.success(`'${section.label}' 섹션을 추가했습니다. 홈페이지 맨 아래에 보입니다.`)
          onClose()
        },
        onError: (err) => {
          toast.error(pickErrorMessage(err, '섹션을 추가하지 못했습니다.'))
        },
      }
    )
  }

  const remaining =
    limits.limit === null ? null : Math.max(limits.limit - limits.count, 0)

  return (
    <Modal open={open} onClose={onClose} title="섹션 추가" size="sm">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          handleSubmit()
        }}
      >
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-slate-900">
            어떤 섹션을 추가할까요?
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {limits.addable_types.map((t) => (
              <label
                key={t.section_type}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"
              >
                <input
                  type="radio"
                  name="section-type"
                  value={t.section_type}
                  checked={sectionType === t.section_type}
                  onChange={() => setSectionType(t.section_type)}
                />
                {t.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <label htmlFor="new-section-label" className="text-sm font-medium text-slate-700">
            섹션 이름 (선택)
          </label>
          <Input
            id="new-section-label"
            value={label}
            maxLength={100}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="비워 두면 종류 이름으로"
          />
        </div>

        <p className="text-xs text-slate-500">
          시작 문구가 들어간 채로 맨 아래에 추가됩니다. 저장 후 내용을 바꿔 주세요.
          {remaining !== null && ` (앞으로 ${remaining}개 더 추가할 수 있어요)`}
        </p>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" disabled={!sectionType || create.isPending}>
            {create.isPending ? '추가 중...' : '추가'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
