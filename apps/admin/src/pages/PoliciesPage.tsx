import { useState } from 'react'
import dayjs from 'dayjs'
import { ExternalLink, TriangleAlert } from 'lucide-react'
import { Button, toast } from '@cms/ui'
import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import { useCanEdit } from '@/hooks/useCanEdit'
import {
  type PolicyDocument,
  type PolicyKind,
  usePolicies,
  useUpdatePolicy,
} from '@/hooks/usePolicies'
import { pickErrorMessage } from '@/lib/errorMessages'
import { useAuthStore } from '@/stores/authStore'

const CLIENT_BASE_URL = import.meta.env.VITE_CLIENT_BASE_URL ?? 'http://localhost:3000'
const BODY_MAX = 30000
const KINDS: PolicyKind[] = ['terms', 'privacy']

interface PolicyEditorProps {
  doc: PolicyDocument
  homepageUrl: string | null
}

function PolicyEditor({ doc, homepageUrl }: PolicyEditorProps) {
  const canEdit = useCanEdit()
  const update = useUpdatePolicy()
  const [body, setBody] = useState(doc.body)
  const changed = body.trim() !== doc.body.trim()

  const save = async (next: string | null) => {
    try {
      const saved = await update.mutateAsync({ kind: doc.kind, body: next })
      setBody(saved.body)
      toast.success(next === null ? '기본 문안으로 되돌렸습니다.' : `${doc.title}을 저장했습니다.`)
    } catch (error) {
      toast.error(pickErrorMessage(error, '저장하지 못했습니다.'))
    }
  }

  const reset = () => {
    if (!window.confirm(`${doc.title}을 기본 문안으로 되돌릴까요? 고친 내용은 사라집니다.`)) return
    void save(null)
  }

  return (
    <section
      className="rounded-xl border border-slate-200 bg-white p-5"
      aria-labelledby={`${doc.kind}-title`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id={`${doc.kind}-title`} className="mr-auto text-base font-semibold text-slate-900">
          {doc.title}
        </h2>
        <span
          className={`rounded px-2 py-0.5 text-xs ${
            doc.is_default ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {doc.is_default
            ? '기본 문안 사용 중'
            : `직접 작성 · ${dayjs(doc.updated_at).format('YYYY.MM.DD')} 시행`}
        </span>
        {homepageUrl && (
          <a
            href={`${homepageUrl}/${doc.kind}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
          >
            홈페이지에서 보기
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        )}
      </div>
      <ReadOnlyFieldset>
        <label className="block">
          <span className="sr-only">{doc.title} 내용</span>
          <textarea
            className="h-96 w-full rounded-md border border-slate-300 p-3 text-sm leading-relaxed text-slate-800"
            value={body}
            maxLength={BODY_MAX}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
      </ReadOnlyFieldset>
      <p className="mt-1 text-xs text-slate-500">
        빈 줄로 문단을 나눠요. 기본 문안은 사업체 이름 · 대표자 · 연락처(사이트 설정)와 보관 기간이
        자동으로 들어가요.
      </p>
      {canEdit && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {!doc.is_default && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={update.isPending}
              onClick={reset}
            >
              기본 문안으로 되돌리기
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            loading={update.isPending}
            disabled={!changed}
            onClick={() => save(body)}
          >
            저장
          </Button>
        </div>
      )}
    </section>
  )
}

/** 이용약관 · 개인정보처리방침 (T-200, 상위 기획서 10.2 #7 · 16.3) */
export function PoliciesPage() {
  const query = usePolicies()
  const tenantSlug = useAuthStore((st) => st.tenantSlug)
  const homepageUrl = tenantSlug ? `${CLIENT_BASE_URL}/${tenantSlug}` : null

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">약관 · 방침</h1>
        <p className="mt-1 text-sm text-slate-500">
          홈페이지 푸터와 회원가입 · 상담 · 예약의 [보기]에 나오는 이용약관과
          개인정보처리방침이에요.
        </p>
      </div>
      <div
        className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        role="note"
      >
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          기본 문안은 예시예요. 사업체에 맞게 고치고, 홈페이지를 열기 전에 법률 확인을 받으세요.
        </p>
      </div>
      {query.isError && <p className="text-sm text-red-600">약관 · 방침을 불러오지 못했습니다.</p>}
      {query.isLoading && <div className="h-96 animate-pulse rounded-xl bg-slate-100" />}
      {query.data && (
        <div className="grid gap-6 xl:grid-cols-2">
          {KINDS.map((kind) => (
            <PolicyEditor
              key={`${kind}-${query.data[kind].updated_at ?? 'default'}`}
              doc={query.data[kind]}
              homepageUrl={homepageUrl}
            />
          ))}
        </div>
      )}
    </div>
  )
}
