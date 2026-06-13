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
import { toast } from '@cms/ui'
import { SectionListItem } from './SectionListItem'
import {
  type Section,
  useReorderSections,
  useToggleSection,
} from '@/hooks/useSections'

interface SectionListProps {
  sections: Section[]
}

export function SectionList({ sections }: SectionListProps) {
  const reorder = useReorderSections()
  const toggle = useToggleSection()

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
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}
