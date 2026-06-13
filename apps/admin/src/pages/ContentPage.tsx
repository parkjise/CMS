import { useState } from 'react'
import { Layers, Settings } from 'lucide-react'
import { SectionList } from '@/components/content/SectionList'
import { useSections } from '@/hooks/useSections'

type Tab = 'sections' | 'settings'

export function ContentPage() {
  const [activeTab, setActiveTab] = useState<Tab>('sections')
  const { data: sections, isLoading, isError } = useSections()

  return (
    <div className="space-y-6 p-6 md:p-8">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">콘텐츠 편집</h1>
        <p className="mt-1 text-sm text-slate-500">
          홈페이지에 노출될 섹션을 관리합니다. 드래그로 순서를 바꾸고 토글로 노출
          여부를 조정하세요.
        </p>
      </div>

      {/* 탭 */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-6">
          <TabButton
            active={activeTab === 'sections'}
            onClick={() => setActiveTab('sections')}
            icon={Layers}
            label="섹션 관리"
          />
          <TabButton
            active={activeTab === 'settings'}
            onClick={() => setActiveTab('settings')}
            icon={Settings}
            label="공통 설정"
          />
        </nav>
      </div>

      {/* 콘텐츠 */}
      {activeTab === 'sections' && (
        <SectionsTab
          sections={sections ?? []}
          isLoading={isLoading}
          isError={isError}
        />
      )}
      {activeTab === 'settings' && <SettingsTab />}
    </div>
  )
}

// ── 탭 버튼 ──────────────────────────────────────────────────────────────

interface TabButtonProps {
  active: boolean
  onClick: () => void
  icon: typeof Layers
  label: string
}

function TabButton({ active, onClick, icon: Icon, label }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition ${
        active
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

// ── 섹션 관리 탭 ─────────────────────────────────────────────────────────

interface SectionsTabProps {
  sections: ReturnType<typeof useSections>['data'] extends infer T
    ? NonNullable<T>
    : never
  isLoading: boolean
  isError: boolean
}

function SectionsTab({ sections, isLoading, isError }: SectionsTabProps) {
  if (isLoading) {
    return (
      <ul className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <li
            key={i}
            className="h-16 animate-pulse rounded-lg border border-slate-200 bg-white"
          />
        ))}
      </ul>
    )
  }

  if (isError) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        섹션 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
      </div>
    )
  }

  return <SectionList sections={sections} />
}

// ── 공통 설정 탭 (placeholder, T-037+에서 확장) ──────────────────────────

function SettingsTab() {
  return (
    <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">
      <Settings className="mb-2 h-6 w-6 text-slate-300" />
      공통 설정은 곧 제공될 예정입니다.
    </div>
  )
}
