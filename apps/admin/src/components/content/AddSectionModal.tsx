import { useEffect, useState } from 'react'
import { Button, Input, Modal, toast } from '@cms/ui'
import { type SectionLimits, useCreateSection } from '@/hooks/useSections'
import { pickErrorMessage } from '@/lib/errorMessages'

interface AddSectionModalProps {
  open: boolean
  limits: SectionLimits
  /** 넣을 페이지 (T-241) — 없으면 홈 */
  pageKey?: string
  onClose: () => void
}

/** 종류 칸 값 — 코드형 사진+글은 배치(variant)마다 따로 (T-241) */
const kindOf = (t: { section_type: string; variant?: string | null }) =>
  t.variant ? `${t.section_type}:${t.variant}` : t.section_type

/** 섹션 추가 — 종류는 서버가 알려 준 addable_types 중에서 (기획서 AD-02, T-037-A) */
export function AddSectionModal({ open, limits, pageKey = 'home', onClose }: AddSectionModalProps) {
  const create = useCreateSection()
  const [kind, setKind] = useState('')
  const [label, setLabel] = useState('')

  useEffect(() => {
    if (open) {
      setKind(limits.addable_types[0] ? kindOf(limits.addable_types[0]) : '')
      setLabel('')
    }
  }, [open, limits.addable_types])

  const handleSubmit = () => {
    const picked = limits.addable_types.find((t) => kindOf(t) === kind)
    if (!picked) return
    create.mutate(
      {
        section_type: picked.section_type,
        variant: picked.variant ?? undefined,
        label: label.trim() || undefined,
        page_key: pageKey,
      },
      {
        onSuccess: (section) => {
          toast.success(`'${section.label}' 섹션을 추가했습니다. 이 페이지 맨 아래에 보입니다.`)
          onClose()
        },
        onError: (err) => {
          toast.error(pickErrorMessage(err, '섹션을 추가하지 못했습니다.'))
        },
      }
    )
  }

  const remaining = limits.limit === null ? null : Math.max(limits.limit - limits.count, 0)

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
                key={kindOf(t)}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"
              >
                <input
                  type="radio"
                  name="section-type"
                  value={kindOf(t)}
                  checked={kind === kindOf(t)}
                  onChange={() => setKind(kindOf(t))}
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
          <Button type="submit" disabled={!kind || create.isPending}>
            {create.isPending ? '추가 중...' : '추가'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
