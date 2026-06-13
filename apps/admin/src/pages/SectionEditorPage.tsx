import { useState } from 'react'
import { ArrowLeft, Smartphone, Sliders } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from '@cms/ui'
import { getFormForType } from '@/components/content/forms'
import type { SettingUpdate } from '@/hooks/useSection'
import { useSection, useUpdateSection } from '@/hooks/useSection'

type SubTab = 'desktop' | 'mobile'

export function SectionEditorPage() {
  const { sectionId } = useParams<{ sectionId: string }>()
  const navigate = useNavigate()
  const [subTab, setSubTab] = useState<SubTab>('desktop')

  const sectionQuery = useSection(sectionId)
  const updateMutation = useUpdateSection(sectionId ?? '')

  const handleSubmit = async (settings: SettingUpdate[]) => {
    try {
      await updateMutation.mutateAsync({ settings })
      toast.success('변경사항을 저장했습니다.')
    } catch {
      toast.error('저장에 실패했습니다. 잠시 후 다시 시도해주세요.')
    }
  }

  if (!sectionId) {
    return (
      <div className="p-8 text-sm text-rose-600">잘못된 접근입니다.</div>
    )
  }

  if (sectionQuery.isLoading) {
    return (
      <div className="space-y-4 p-8">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="h-96 animate-pulse rounded bg-slate-100" />
      </div>
    )
  }

  if (sectionQuery.isError || !sectionQuery.data) {
    return (
      <div className="p-8">
        <button
          type="button"
          onClick={() => navigate('/admin/content')}
          className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" /> 목록으로
        </button>
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          섹션을 불러올 수 없습니다.
        </div>
      </div>
    )
  }

  const section = sectionQuery.data
  const Form = getFormForType(section.section_type)

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <Link
          to="/admin/content"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" /> 섹션 목록
        </Link>
        <div className="mt-2 flex items-baseline gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{section.label}</h1>
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {section.section_type}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          입력한 내용은 [변경사항 저장] 버튼을 눌러야 반영됩니다.
        </p>
      </div>

      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-6">
          <SubTabButton
            active={subTab === 'desktop'}
            icon={Sliders}
            label="기본 설정"
            onClick={() => setSubTab('desktop')}
          />
          <SubTabButton
            active={subTab === 'mobile'}
            icon={Smartphone}
            label="모바일 설정"
            onClick={() => setSubTab('mobile')}
          />
        </nav>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        {subTab === 'desktop' ? (
          <Form
            section={section}
            isSaving={updateMutation.isPending}
            onSubmit={handleSubmit}
          />
        ) : (
          <div className="flex h-40 flex-col items-center justify-center text-sm text-slate-400">
            <Smartphone className="mb-2 h-6 w-6 text-slate-300" />
            모바일 전용 설정은 곧 제공됩니다.
          </div>
        )}
      </div>
    </div>
  )
}

interface SubTabButtonProps {
  active: boolean
  icon: typeof Sliders
  label: string
  onClick: () => void
}

function SubTabButton({ active, icon: Icon, label, onClick }: SubTabButtonProps) {
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
