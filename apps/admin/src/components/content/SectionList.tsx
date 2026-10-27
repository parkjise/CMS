import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useState } from 'react'
import { toast } from '@cms/ui'
import { DeleteSectionDialog } from './DeleteSectionDialog'
import { SectionListItem } from './SectionListItem'
import {
  type Section,
  useReorderSections,
  useToggleSection,
} from '@/hooks/useSections'

interface SectionListProps {
  sections: Section[]
  /** 서버 한도 응답의 can_delete — 요금제 · 템플릿이 허용할 때만 삭제 버튼 (T-037-A) */
  canDelete?: boolean
}

export function SectionList({ sections, canDelete = false }: SectionListProps) {
  const reorder = useReorderSections()
  const toggle = useToggleSection()
  const [deleting, setDeleting] = useState<Section | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = sections.findIndex((s) => s.id === active.id)
    const newIndex = sections.findIndex((s) => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const orderedIds = arrayMove(sections, oldIndex, newIndex).map((s) => s.id)

    reorder.mutate(orderedIds, {
      onError: () => {
        toast.error('순서 변경에 실패했습니다. 다시 시도해주세요.')
      },
    })
  }

  const handleToggle = (sectionId: string) => {
    toggle.mutate(sectionId, {
      onError: () => {
        toast.error('상태 변경에 실패했습니다.')
      },
    })
  }

  if (sections.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">
        구성된 섹션이 없습니다. 템플릿을 적용해주세요.
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={sections.map((s) => s.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="space-y-2">
          {sections.map((section) => (
            <SectionListItem
              key={section.id}
              section={section}
              onToggle={handleToggle}
              isToggling={toggle.isPending}
              onDelete={canDelete ? setDeleting : undefined}
            />
          ))}
        </ul>
      </SortableContext>
      <DeleteSectionDialog section={deleting} onClose={() => setDeleting(null)} />
    </DndContext>
  )
}
