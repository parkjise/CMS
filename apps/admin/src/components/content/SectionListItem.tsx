import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Briefcase,
  Calendar,
  FileText,
  FolderOpen,
  GripVertical,
  HelpCircle,
  type LucideIcon,
  Image as ImageIcon,
  Images,
  Layout,
  MapPin,
  Phone,
  Users,
} from 'lucide-react'
import { Toggle } from '@cms/ui'
import type { Section } from '@/hooks/useSections'

const SECTION_ICONS: Record<string, LucideIcon> = {
  HERO_BANNER: ImageIcon,
  INTRO: FileText,
  SERVICES: Briefcase,
  GALLERY: Images,
  RESERVATION: Calendar,
  CONTACT: Phone,
  MAP: MapPin,
  PORTFOLIO: FolderOpen,
  TEAM: Users,
  FAQ: HelpCircle,
}

const SECTION_TYPE_LABELS: Record<string, string> = {
  HERO_BANNER: '히어로 배너',
  INTRO: '소개',
  SERVICES: '서비스/진료',
  GALLERY: '갤러리',
  RESERVATION: '예약 안내',
  CONTACT: '연락처',
  MAP: '지도',
  PORTFOLIO: '포트폴리오',
  TEAM: '팀 소개',
  FAQ: 'FAQ',
}

interface SectionListItemProps {
  section: Section
  onToggle: (id: string) => void
  isToggling: boolean
}

export function SectionListItem({
  section,
  onToggle,
  isToggling,
}: SectionListItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id })

  const Icon = SECTION_ICONS[section.section_type] ?? Layout
  const typeLabel =
    SECTION_TYPE_LABELS[section.section_type] ?? section.section_type

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm ${
        isDragging ? 'z-10 opacity-70 shadow-md' : ''
      } ${section.is_active ? '' : 'opacity-60'}`}
    >
      {/* 드래그 핸들 */}
      <button
        type="button"
        className="cursor-grab touch-none rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
        aria-label={`${section.label} 순서 변경`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* 타입 아이콘 */}
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
        <Icon className="h-4 w-4" />
      </span>

      {/* 라벨 + 타입 */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-900">
          {section.label}
        </div>
        <div className="mt-0.5 text-xs text-slate-500">{typeLabel}</div>
      </div>

      {/* 활성화 토글 */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">
          {section.is_active ? '노출' : '숨김'}
        </span>
        <Toggle
          checked={section.is_active}
          onChange={() => onToggle(section.id)}
          disabled={isToggling}
          aria-label={`${section.label} 활성화 토글`}
        />
      </div>
    </li>
  )
}
