import { useState } from 'react'
import { Button, Input, Toggle, toast } from '@cms/ui'
import { PLAN_TYPES } from '@/lib/plans'
import { useTenants } from '@/hooks/useTenants'
import {
  useCreateAnnouncement,
  type AnnouncementInput,
  type AnnouncementType,
} from '@/hooks/useAnnouncements'
import { TypeBadge } from './TypeBadge'

const TYPE_OPTIONS: { value: AnnouncementType; label: string }[] = [
  { value: 'INFO', label: '정보 (INFO)' },
  { value: 'WARNING', label: '주의 (WARNING)' },
  { value: 'FEATURE_UPDATE', label: '기능 업데이트 (FEATURE_UPDATE)' },
  { value: 'MAINTENANCE', label: '점검 (MAINTENANCE)' },
  { value: 'URGENT', label: '긴급 (URGENT)' },
]

type Target = 'ALL' | 'PLAN_BASED' | 'SELECTIVE'

export function AnnouncementForm() {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<AnnouncementType>('INFO')
  const [target, setTarget] = useState<Target>('ALL')
  const [plan, setPlan] = useState('STANDARD')
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [content, setContent] = useState('')
  const [showBanner, setShowBanner] = useState(true)
  const [sendKakao, setSendKakao] = useState(false)
  const [expiresAt, setExpiresAt] = useState('')
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState('')

  const { data: tenantList } = useTenants({
    q: search || undefined,
    page: 1,
    limit: 20,
  })
  const create = useCreateAnnouncement()

  const toggleTenant = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const buildInput = (publish_now: boolean): AnnouncementInput => ({
    title,
    content,
    type,
    target_type: target,
    target_plan: target === 'PLAN_BASED' ? plan : undefined,
    target_tenants: target === 'SELECTIVE' ? selected : undefined,
    show_in_admin: showBanner,
    send_kakao: sendKakao,
    send_email: false,
    publish_now,
    expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
  })

  const reset = () => {
    setTitle('')
    setContent('')
    setExpiresAt('')
    setSelected([])
  }

  const submit = async (publish_now: boolean) => {
    setError('')
    if (!title || !content) {
      setError('제목과 내용을 입력하세요.')
      return
    }
    if (target === 'SELECTIVE' && selected.length === 0) {
      setError('대상 테넌트를 1개 이상 선택하세요.')
      return
    }
    try {
      await create.mutateAsync(buildInput(publish_now))
      toast.success(publish_now ? '공지를 발송했습니다.' : '임시저장했습니다.')
      reset()
    } catch {
      setError('저장에 실패했습니다.')
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold text-slate-900">공지 작성</h2>

      <div className="space-y-3">
        <Input label="제목" value={title} onChange={(e) => setTitle(e.target.value)} />

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">유형</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as AnnouncementType)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* 대상 */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">대상</label>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="target"
                checked={target === 'ALL'}
                onChange={() => setTarget('ALL')}
              />
              전체
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="target"
                checked={target === 'PLAN_BASED'}
                onChange={() => setTarget('PLAN_BASED')}
              />
              플랜별
            </label>
            {target === 'PLAN_BASED' && (
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1 text-xs"
              >
                {PLAN_TYPES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            )}
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="target"
                checked={target === 'SELECTIVE'}
                onChange={() => setTarget('SELECTIVE')}
              />
              선택
            </label>
          </div>
        </div>

        {target === 'SELECTIVE' && (
          <div>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="테넌트 검색"
              className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <ul className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {tenantList?.items.map((t) => (
                <li key={t.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.includes(t.id)}
                      onChange={() => toggleTenant(t.id)}
                    />
                    {t.name}
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-slate-400">{selected.length}개 선택됨</p>
          </div>
        )}

        <div>
          <label
            htmlFor="ann-content"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            내용
          </label>
          <textarea
            id="ann-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        {/* 발송 방법 + 만료일 */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <Toggle
              label="관리자 페이지 배너 노출"
              checked={showBanner}
              onChange={(e) => setShowBanner(e.target.checked)}
            />
            <Toggle
              label="카카오 알림톡 발송"
              checked={sendKakao}
              onChange={(e) => setSendKakao(e.target.checked)}
            />
            <Toggle label="이메일 발송 (준비 중)" checked={false} disabled />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              만료일
            </label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* 미리보기 */}
        {preview && (
          <div
            data-testid="preview"
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm"
          >
            <TypeBadge type={type} />
            <span className="font-medium text-slate-800">
              {title || '(제목 없음)'}
            </span>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => setPreview((p) => !p)}>
            미리보기
          </Button>
          <Button
            variant="secondary"
            onClick={() => submit(false)}
            loading={create.isPending}
          >
            임시저장
          </Button>
          <Button onClick={() => submit(true)} loading={create.isPending}>
            즉시 발송
          </Button>
        </div>
      </div>
    </section>
  )
}
