import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import { useState } from 'react'
import { Lock, Plus } from 'lucide-react'
import { Button } from '@cms/ui'
import { AddSectionModal } from '@/components/content/AddSectionModal'
import { SectionList } from '@/components/content/SectionList'
import { type SectionLimits, useSectionLimits, useSections } from '@/hooks/useSections'

interface PageSectionsProps {
  /** 이 페이지의 섹션만 (T-238) — 섹션 추가 · 삭제 한도도 이 페이지 것 (T-241) */
  pageKey: string
}

/** 한 페이지의 섹션 — 페이지 관리 > 페이지 편집의 [섹션] 탭 (예전 콘텐츠 편집 화면) */
export function PageSections({ pageKey }: PageSectionsProps) {
  const { data, isLoading, isError } = useSections()
  const sections = (data ?? []).filter((s) => (s.page_key ?? 'home') === pageKey)

  return (
    <ReadOnlyFieldset>
      <SectionsTab sections={sections} isLoading={isLoading} isError={isError} pageKey={pageKey} />
    </ReadOnlyFieldset>
  )
}

// ── 섹션 관리 탭 ─────────────────────────────────────────────────────────

interface SectionsTabProps {
  sections: ReturnType<typeof useSections>['data'] extends infer T ? NonNullable<T> : never
  isLoading: boolean
  isError: boolean
  pageKey: string
}

function SectionsTab({ sections, isLoading, isError, pageKey }: SectionsTabProps) {
  if (isLoading) {
    return (
      <ul className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="h-16 animate-pulse rounded-lg border border-slate-200 bg-white" />
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

  return <SectionsWithLimits sections={sections} pageKey={pageKey} />
}

// ── 섹션 추가 · 삭제 (기획서 AD-02 · 3.2, T-037-A) ─────────────────────────

function SectionsWithLimits({
  sections,
  pageKey,
}: {
  sections: SectionsTabProps['sections']
  pageKey: string
}) {
  // 스위치가 꺼진 직접 페이지는 한도가 404 — 추가 막대 없이 목록만
  const { data: limits } = useSectionLimits(pageKey)
  const [adding, setAdding] = useState(false)

  return (
    <div className="space-y-4">
      <SectionList
        sections={sections}
        canDelete={limits?.can_delete ?? false}
        emptyText={
          pageKey === 'home'
            ? undefined
            : '이 페이지에는 아직 섹션이 없어요. 아래에서 추가해 주세요.'
        }
      />
      {limits && <AddSectionBar limits={limits} onAdd={() => setAdding(true)} />}
      {limits && (
        <AddSectionModal
          open={adding}
          limits={limits}
          pageKey={pageKey}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  )
}

function AddSectionBar({ limits, onAdd }: { limits: SectionLimits; onAdd: () => void }) {
  const usage =
    limits.limit === null ? `${limits.count}개 사용 중` : `${limits.count} / ${limits.limit}개`
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-slate-600">
        <span className="font-medium text-slate-900">섹션 {usage}</span>
        {limits.reason && (
          <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-500" role="note">
            <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            {limits.reason}
          </p>
        )}
      </div>
      <Button type="button" onClick={onAdd} disabled={!limits.can_add}>
        <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
        섹션 추가
      </Button>
    </div>
  )
}
