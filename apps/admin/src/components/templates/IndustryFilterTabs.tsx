import { INDUSTRY_LABELS, type IndustryType } from '@/hooks/useTemplates'

interface IndustryFilterTabsProps {
  value: IndustryType | null
  onChange: (value: IndustryType | null) => void
}

const INDUSTRIES: IndustryType[] = ['HOSPITAL', 'PENSION', 'STARTUP', 'GENERAL']

export function IndustryFilterTabs({
  value,
  onChange,
}: IndustryFilterTabsProps) {
  const tabClass = (active: boolean) =>
    `rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
      active
        ? 'bg-slate-900 text-white'
        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    }`

  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="업종 필터">
      <button
        type="button"
        role="tab"
        aria-selected={value === null}
        className={tabClass(value === null)}
        onClick={() => onChange(null)}
      >
        전체
      </button>
      {INDUSTRIES.map((industry) => (
        <button
          key={industry}
          type="button"
          role="tab"
          aria-selected={value === industry}
          className={tabClass(value === industry)}
          onClick={() => onChange(industry)}
        >
          {INDUSTRY_LABELS[industry]}
        </button>
      ))}
    </div>
  )
}
