import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, Smartphone, Sliders } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from '@cms/ui'
import { getFormForType } from '@/components/content/forms'
import { MobileSettingsForm } from '@/components/content/forms/MobileSettingsForm'
import { preserveRichText } from '@/components/content/forms/utils'
import type { SettingUpdate } from '@/hooks/useSection'
import { usePreviewSection, useSection, useUpdateSection } from '@/hooks/useSection'
import { SectionPreviewContext } from '@/components/content/forms/previewContext'
import { buildSectionDraftUrl } from '@/lib/previewUrl'
import { pickErrorMessage } from '@/lib/errorMessages'
import { useAuthStore } from '@/stores/authStore'
import { sampleKeys } from '@/lib/sampleContent'

type SubTab = 'desktop' | 'mobile'

export function SectionEditorPage() {
  const { sectionId } = useParams<{ sectionId: string }>()
  const navigate = useNavigate()
  const [subTab, setSubTab] = useState<SubTab>('desktop')

  const sectionQuery = useSection(sectionId)
  const updateMutation = useUpdateSection(sectionId ?? '')
  const previewMutation = usePreviewSection(sectionId ?? '')
  const tenantSlug = useAuthStore((s) => s.tenantSlug)
  // [미리보기] 로 제출 — 저장 대신 그 순간 연 새 탭을 미리보기 주소로 보낸다 (T-206).
  // 탭이 막혀 null 이어도 미리보기 제출이므로 저장하지 않는다
  const previewIntent = useRef<{ win: Window | null } | null>(null)

  const previewActions = useMemo(
    () => ({
      markPreview: () => {
        const intent = { win: window.open('', '_blank') }
        previewIntent.current = intent
        // 폼이 제출되지 않으면(브라우저 입력 검사 등) 빈 탭을 닫고 다음 [저장]은 저장으로
        window.setTimeout(() => {
          if (previewIntent.current === intent) {
            intent.win?.close()
            previewIntent.current = null
          }
        }, 0)
      },
      isPreviewing: previewMutation.isPending,
    }),
    [previewMutation.isPending],
  )

  const handlePreview = async (settings: SettingUpdate[], win: Window | null) => {
    if (!win) {
      toast.error('새 탭이 차단되었습니다. 브라우저에서 팝업을 허용해주세요.')
      return
    }
    try {
      const { token, page_key } = await previewMutation.mutateAsync(settings)
      win.opener = null
      win.location.href = buildSectionDraftUrl(tenantSlug ?? '', token, page_key)
    } catch (e) {
      win.close()
      toast.error(pickErrorMessage(e, '미리보기를 열지 못했습니다.'))
    }
  }

  const handleSubmit = async (settings: SettingUpdate[]) => {
    // 고치지 않은 서식 글은 서식 그대로 (T-065-A)
    const original = sectionQuery.data?.settings ?? []
    const intent = previewIntent.current
    if (intent) {
      previewIntent.current = null
      await handlePreview(preserveRichText(original, settings), intent.win)
      return
    }
    try {
      await updateMutation.mutateAsync({ settings: preserveRichText(original, settings) })
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
  const samples = sampleKeys(section)

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
          입력한 내용은 [변경사항 저장] 버튼을 눌러야 반영됩니다. 저장 전에 [미리보기]로
          홈페이지에서 어떻게 보이는지 확인할 수 있어요.
        </p>
      </div>

      {samples.length > 0 && (
        <div
          role="note"
          className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
        >
          <p className="font-medium">
            샘플 문구예요 — 내 내용으로 바꿔주세요 ({samples.length}개 남음)
          </p>
          <p className="mt-1 text-amber-700">
            템플릿 샘플이 그대로 남아 있는 항목: {samples.join(', ')}. 저장하면
            샘플 표시가 사라집니다.
          </p>
        </div>
      )}

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
        <ReadOnlyFieldset>
        <SectionPreviewContext.Provider value={previewActions}>
        {subTab === 'desktop' ? (
          <Form
            section={section}
            isSaving={updateMutation.isPending}
            onSubmit={handleSubmit}
          />
        ) : (
          // 휴대폰에서 숨기기 · 휴대폰용 배경 이미지 (T-037-D)
          <MobileSettingsForm
            section={section}
            isSaving={updateMutation.isPending}
            onSubmit={handleSubmit}
          />
        )}
        </SectionPreviewContext.Provider>
        </ReadOnlyFieldset>
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
