import { useEffect, useState } from 'react'
import { CalendarClock, ExternalLink, FilePlus2, History, TriangleAlert } from 'lucide-react'
import { Button, Input, Modal, toast } from '@cms/ui'
import { FormField } from '@/components/content/forms/FormField'
import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import { SaveBar } from '@/components/site/SaveBar'
import { SITE_CARD } from '@/components/site/SitePage'
import { useCanEdit } from '@/hooks/useCanEdit'
import { useLeaveGuard } from '@/hooks/useLeaveGuard'
import {
  type PolicyDocument,
  type PolicyKind,
  type PolicyStatus,
  useCancelPolicySchedule,
  useCreatePolicyDraft,
  usePolicies,
  usePolicyVersion,
  usePublishPolicy,
  useSavePolicyDraft,
} from '@/hooks/usePolicies'
import { pickErrorMessage } from '@/lib/errorMessages'
import { fromSeoulInput, seoulDateTime } from '@/lib/seoulTime'
import { useAuthStore } from '@/stores/authStore'

const CLIENT_BASE_URL = import.meta.env.VITE_CLIENT_BASE_URL ?? 'http://localhost:3000'
const BODY_MAX = 30000
const SUMMARY_MAX = 500
const KINDS: PolicyKind[] = ['terms', 'privacy']

/** 문서가 쓰이는 곳 (와이어프레임 03 '연결') */
const LINKED: Record<PolicyKind, string> = {
  terms: '푸터 · 회원가입 · 상담 · 예약',
  privacy: '푸터 · 회원가입 · 상담 · 예약 · 방문자 글쓰기',
}

const STATUS_LABEL: Record<PolicyStatus, string> = {
  draft: '초안',
  scheduled: '예약',
  published: '공개',
  archived: '보관',
}

const STATUS_CLASS: Record<PolicyStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  scheduled: 'bg-blue-50 text-blue-700',
  published: 'bg-emerald-50 text-emerald-700',
  archived: 'bg-slate-50 text-slate-400',
}

const StatusBadge = ({ status }: { status: PolicyStatus }) => (
  <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
    {STATUS_LABEL[status]}
  </span>
)

/** 목록의 상태 칸 — 작업 중인 버전이 있으면 그것도 */
function DocumentState({ doc }: { doc: PolicyDocument }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {doc.version ? (
        <StatusBadge status="published" />
      ) : (
        <span className="text-xs text-amber-700">기본 문안</span>
      )}
      {doc.working && <StatusBadge status={doc.working.status} />}
    </div>
  )
}

interface VersionModalProps {
  kind: PolicyKind
  version: number | null
  onClose: () => void
}

function VersionModal({ kind, version, onClose }: VersionModalProps) {
  const query = usePolicyVersion(kind, version)
  const doc = query.data
  return (
    <Modal
      open={version !== null}
      onClose={onClose}
      title={doc ? `${doc.title} v${doc.version}` : '버전 보기'}
    >
      {query.isLoading && <div className="h-40 animate-pulse rounded bg-slate-100" />}
      {doc && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <StatusBadge status={doc.status} />
            {doc.effective_at && <span>{seoulDateTime(doc.effective_at)} 시행</span>}
            {doc.summary && <span>· {doc.summary}</span>}
          </div>
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">
            {doc.body}
          </pre>
        </div>
      )}
    </Modal>
  )
}

interface EditorProps {
  doc: PolicyDocument
  homepageUrl: string | null
}

function PolicyEditor({ doc, homepageUrl }: EditorProps) {
  const canEdit = useCanEdit()
  const create = useCreatePolicyDraft()
  const save = useSavePolicyDraft()
  const publish = usePublishPolicy()
  const cancel = useCancelPolicySchedule()
  const working = doc.working
  const isDraft = working?.status === 'draft'
  const [tab, setTab] = useState<'edit' | 'history'>('edit')
  const [body, setBody] = useState(working?.body ?? '')
  const [summary, setSummary] = useState(working?.summary ?? '')
  const [effective, setEffective] = useState('')
  const [viewing, setViewing] = useState<number | null>(null)
  const dirty = isDraft && (body !== working.body || summary !== (working.summary ?? ''))
  useLeaveGuard(dirty)

  useEffect(() => {
    setBody(doc.working?.body ?? '')
    setSummary(doc.working?.summary ?? '')
  }, [doc.working])

  const fail = (fallback: string) => (error: unknown) =>
    toast.error(pickErrorMessage(error, fallback))

  const handleSave = () =>
    save.mutate(
      { kind: doc.kind, body, summary },
      {
        onSuccess: () => toast.success('초안을 저장했습니다.'),
        onError: fail('초안을 저장하지 못했습니다.'),
      }
    )

  const handlePublish = () => {
    const at = fromSeoulInput(effective)
    const scheduled = at !== null && new Date(at).getTime() > Date.now()
    const question = scheduled
      ? `${doc.title} v${working?.version}을(를) ${seoulDateTime(at)}에 시행하도록 예약할까요?`
      : `${doc.title} v${working?.version}을(를) 지금 공개할까요? 지금 공개본은 보관돼요.`
    if (!window.confirm(question)) return
    publish.mutate(
      { kind: doc.kind, effectiveAt: at },
      {
        onSuccess: () => {
          setEffective('')
          toast.success(
            scheduled ? '시행일을 예약했습니다.' : '공개했습니다. 홈페이지에 바로 반영돼요.'
          )
        },
        onError: fail('공개하지 못했습니다.'),
      }
    )
  }

  const tabClass = (active: boolean) =>
    `border-b-2 px-1 pb-2 text-sm font-medium ${active ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`

  return (
    <section className={`${SITE_CARD} min-w-0`} aria-labelledby={`${doc.kind}-editor`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={`${doc.kind}-editor`} className="mr-auto text-base font-semibold text-slate-900">
          선택 문서 편집 — {doc.title}
        </h2>
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
      <div className="flex gap-5 border-b border-slate-200" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'edit'}
          className={tabClass(tab === 'edit')}
          onClick={() => setTab('edit')}
        >
          내용 편집
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'history'}
          className={tabClass(tab === 'history')}
          onClick={() => setTab('history')}
        >
          버전 이력 ({doc.versions.length})
        </button>
      </div>

      {tab === 'history' ? (
        doc.versions.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            아직 버전이 없어요 — 기본 문안을 보여 주는 중이에요.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100" aria-label={`${doc.title} 버전 이력`}>
            {doc.versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <span className="w-10 font-semibold text-slate-800">v{v.version}</span>
                <StatusBadge status={v.status} />
                <span className="min-w-0 flex-1 truncate text-slate-600">
                  {v.summary ?? '(요약 없음)'}
                </span>
                <span className="text-xs text-slate-400">
                  {v.effective_at
                    ? `${seoulDateTime(v.effective_at)} ${v.status === 'scheduled' ? '시행 예정' : '시행'}`
                    : `${seoulDateTime(v.created_at, false)} 작성`}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewing(v.version)}
                >
                  <History className="mr-1 h-3.5 w-3.5" aria-hidden />
                  보기
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : !working ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            {doc.version
              ? `지금 공개본은 v${doc.version} (${doc.effective_at ? seoulDateTime(doc.effective_at, false) : ''} 시행)이에요. 공개본은 직접 고치지 않고 새 버전을 만들어 고쳐요.`
              : '지금은 기본 문안을 보여 주는 중이에요. 새 버전을 만들면 기본 문안을 복사해 시작해요.'}
          </p>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
            {doc.body}
          </pre>
          {canEdit && (
            <Button
              type="button"
              loading={create.isPending}
              onClick={() =>
                create.mutate(doc.kind, {
                  onSuccess: () => toast.success('새 버전 초안을 만들었습니다.'),
                  onError: fail('새 버전을 만들지 못했습니다.'),
                })
              }
            >
              <FilePlus2 className="mr-1.5 h-4 w-4" aria-hidden />새 버전 만들기
            </Button>
          )}
        </div>
      ) : working.status === 'scheduled' ? (
        <div className="space-y-3">
          <p
            className="flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800"
            role="status"
          >
            <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />v{working.version}이(가){' '}
            {working.effective_at ? seoulDateTime(working.effective_at) : ''}에 시행돼요. 그때 지금
            공개본은 보관돼요.
          </p>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
            {working.body}
          </pre>
          {canEdit && (
            <Button
              type="button"
              variant="secondary"
              loading={cancel.isPending}
              onClick={() =>
                cancel.mutate(doc.kind, {
                  onSuccess: () => toast.success('예약을 취소했습니다. 초안으로 돌아갔어요.'),
                  onError: fail('예약을 취소하지 못했습니다.'),
                })
              }
            >
              예약 취소
            </Button>
          )}
        </div>
      ) : (
        <ReadOnlyFieldset className="min-w-0 space-y-4">
          <p className="text-xs text-slate-500">
            v{working.version} 초안 — 저장해도 홈페이지는 그대로예요. 공개하거나 시행일이 되면
            바뀌어요.
          </p>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">본문</span>
            <textarea
              className="h-96 w-full rounded-md border border-slate-300 p-3 text-sm leading-relaxed text-slate-800"
              value={body}
              maxLength={BODY_MAX}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <p className="text-xs text-slate-500">
            빈 줄로 문단을 나눠요.{' '}
            <button
              type="button"
              className="font-medium text-blue-600 hover:underline"
              onClick={() => {
                if (window.confirm('본문을 기본 문안으로 바꿀까요? 지금 초안 내용은 사라져요.'))
                  setBody(doc.default_body)
              }}
            >
              기본 문안으로 채우기
            </button>
          </p>
          <FormField
            label="변경 내용 요약"
            htmlFor={`${doc.kind}-summary`}
            hint="버전 이력에 남아요. 공개 · 예약하려면 꼭 적어 주세요."
          >
            <Input
              id={`${doc.kind}-summary`}
              value={summary}
              maxLength={SUMMARY_MAX}
              placeholder="예: 보관 기간 조항 수정"
              onChange={(e) => setSummary(e.target.value)}
            />
          </FormField>
          <div className="space-y-2 rounded-lg border border-slate-200 p-4">
            <FormField
              label="시행일 (한국 시간, 선택)"
              htmlFor={`${doc.kind}-effective`}
              hint="비우면 바로 공개해요. 앞날을 고르면 그때 자동으로 시행돼요."
            >
              <input
                id={`${doc.kind}-effective`}
                type="datetime-local"
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
                value={effective}
                onChange={(e) => setEffective(e.target.value)}
              />
            </FormField>
            <Button
              type="button"
              loading={publish.isPending}
              disabled={dirty || !summary.trim()}
              onClick={handlePublish}
            >
              {effective ? '시행일 예약' : '바로 공개'}
            </Button>
            {dirty && <p className="text-xs text-amber-700">바꾼 내용을 먼저 저장해 주세요.</p>}
          </div>
        </ReadOnlyFieldset>
      )}
      {isDraft && tab === 'edit' && (
        <SaveBar
          dirty={dirty}
          saving={save.isPending}
          onReset={() => {
            setBody(working.body)
            setSummary(working.summary ?? '')
          }}
          onSave={handleSave}
        />
      )}
      <VersionModal kind={doc.kind} version={viewing} onClose={() => setViewing(null)} />
    </section>
  )
}

/** 사이트 관리 → 약관 · 정책 관리 (T-200 · T-224, 사이트 관리 기획서 SM-03) */
export function PoliciesPage() {
  const query = usePolicies()
  const tenantSlug = useAuthStore((st) => st.tenantSlug)
  const homepageUrl = tenantSlug ? `${CLIENT_BASE_URL}/${tenantSlug}` : null
  const [selected, setSelected] = useState<PolicyKind>('terms')

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">약관 · 정책 관리</h1>
        <p className="mt-1 text-sm text-slate-500">
          홈페이지 푸터와 회원가입 · 상담 · 예약의 [보기]에 나오는 이용약관과
          개인정보처리방침이에요. 고칠 때마다 새 버전으로 남고, 방문자의 동의 기록에는 그때의 버전이
          함께 저장돼요.
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
      {query.isError && <p className="text-sm text-red-600">약관 · 정책을 불러오지 못했습니다.</p>}
      {query.isLoading && <div className="h-96 animate-pulse rounded-xl bg-slate-100" />}
      {query.data && (
        <>
          <section className={SITE_CARD} aria-labelledby="policy-list-title">
            <h2 id="policy-list-title" className="text-base font-semibold text-slate-900">
              정책 목록
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="py-2 font-medium">문서명</th>
                    <th className="py-2 font-medium">버전</th>
                    <th className="py-2 font-medium">상태</th>
                    <th className="py-2 font-medium">시행일</th>
                    <th className="py-2 font-medium">연결</th>
                  </tr>
                </thead>
                <tbody>
                  {KINDS.map((kind) => {
                    const doc = query.data[kind]
                    const active = kind === selected
                    return (
                      <tr
                        key={kind}
                        className={`border-b border-slate-100 ${active ? 'bg-blue-50' : ''}`}
                      >
                        <td className="py-2.5">
                          <button
                            type="button"
                            className="font-medium text-slate-800 hover:text-blue-700 hover:underline"
                            aria-current={active ? 'true' : undefined}
                            onClick={() => setSelected(kind)}
                          >
                            {doc.title}
                          </button>
                        </td>
                        <td className="py-2.5 text-slate-600">
                          {doc.version ? `v${doc.version}` : '—'}
                        </td>
                        <td className="py-2.5">
                          <DocumentState doc={doc} />
                        </td>
                        <td className="py-2.5 text-slate-600">
                          {doc.effective_at ? seoulDateTime(doc.effective_at, false) : '—'}
                          {doc.working?.status === 'scheduled' && doc.working.effective_at && (
                            <span className="block text-xs text-blue-700">
                              다음 {seoulDateTime(doc.working.effective_at, false)}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-xs text-slate-500">{LINKED[kind]}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <PolicyEditor key={selected} doc={query.data[selected]} homepageUrl={homepageUrl} />
        </>
      )}
    </div>
  )
}
