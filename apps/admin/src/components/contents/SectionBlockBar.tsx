import { useState } from 'react'
import { Link } from 'react-router'
import { Blocks } from 'lucide-react'
import { Button, Input, Modal, toast } from '@cms/ui'
import { useCanEdit } from '@/hooks/useCanEdit'
import {
  useContentBlocks,
  useCreateContentBlock,
  useUnlinkBlock,
} from '@/hooks/useContentBlocks'
import { CONTENT_MANAGE } from '@/hooks/useContentTypes'
import type { Section } from '@/hooks/useSections'
import { pickErrorMessage } from '@/lib/errorMessages'
import { useFeatureOn } from '@/lib/navItems'

const NAME_MAX = 40

/**
 * 섹션 편집 화면 위 공통 블록 안내 (T-260, 콘텐츠 관리 기획서 CM-04).
 * 이어진 섹션: "N곳에서 사용 중 — 여기서 고치면 모두 바뀜" + [연결 끊고 이 섹션만 고치기].
 * 이어지지 않은 섹션: [공통 블록으로 저장].
 */
export function SectionBlockBar({ section }: { section: Section }) {
  const on = useFeatureOn(CONTENT_MANAGE)
  const canEdit = useCanEdit()
  const blocks = useContentBlocks(on).data
  const unlink = useUnlinkBlock()
  const [saving, setSaving] = useState(false)
  if (!on) return null

  const block = section.block_id ? blocks?.find((b) => b.id === section.block_id) : undefined
  if (section.block_id) {
    const others = (block?.usage ?? []).filter((u) => u.section_id !== section.id).length
    return (
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900"
        role="note"
      >
        <p className="flex items-center gap-2">
          <Blocks className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            공통 블록 <strong>{block?.name ?? ''}</strong>
            {others > 0
              ? ` — 다른 ${others}곳에서도 쓰고 있어요. 여기서 고치면 모두 함께 바뀌어요.`
              : ' 에 이어진 섹션이에요.'}{' '}
            <Link to="/admin/contents/blocks" className="underline">
              블록 목록
            </Link>
          </span>
        </p>
        {canEdit && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={unlink.isPending}
            onClick={() =>
              unlink.mutate(section.id, {
                onSuccess: () => toast.success('연결을 끊었어요. 이제 이 섹션만 따로 바뀌어요.'),
                onError: (err) => toast.error(pickErrorMessage(err, '연결을 끊지 못했어요.')),
              })
            }
          >
            연결 끊고 이 섹션만 고치기
          </Button>
        )}
      </div>
    )
  }

  if (!canEdit) return null
  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setSaving(true)}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50"
        >
          <Blocks className="h-3.5 w-3.5" aria-hidden />
          공통 블록으로 저장
        </button>
      </div>
      <SaveBlockDialog section={section} open={saving} onClose={() => setSaving(false)} />
    </>
  )
}

function SaveBlockDialog({
  section,
  open,
  onClose,
}: {
  section: Section
  open: boolean
  onClose: () => void
}) {
  const create = useCreateContentBlock()
  const [name, setName] = useState(section.label.slice(0, NAME_MAX))
  return (
    <Modal open={open} onClose={onClose} title="공통 블록으로 저장" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          지금 저장된 섹션 값으로 블록을 만들어요. 다른 페이지에서 &lsquo;공통 블록에서&rsquo;로
          같은 섹션을 넣을 수 있고, 이 섹션은 블록에 이어져요.
        </p>
        <Input
          label="블록 이름"
          value={name}
          maxLength={NAME_MAX}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button
            type="button"
            loading={create.isPending}
            disabled={!name.trim()}
            onClick={() =>
              create.mutate(
                { section_id: section.id, name: name.trim() },
                {
                  onSuccess: () => {
                    toast.success('공통 블록으로 저장했어요.')
                    onClose()
                  },
                  onError: (err) => toast.error(pickErrorMessage(err, '블록을 만들지 못했어요.')),
                }
              )
            }
          >
            저장
          </Button>
        </div>
      </div>
    </Modal>
  )
}
