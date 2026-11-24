import { useEffect, useMemo, useState } from 'react'
import { Input, Textarea, Toggle, toast } from '@cms/ui'
import { LeaveGuard } from '@/components/site/LeaveGuard'
import { SaveBar } from '@/components/site/SaveBar'
import { SITE_CARD } from '@/components/site/SitePage'
import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import { HOME_PAGE, type Page, type PageInput, useUpdatePage } from '@/hooks/usePages'
import { pickErrorMessage } from '@/lib/errorMessages'
import { pageKeyError, parentOptions } from '@/lib/pageKey'
import { usePageKeyProblem } from '@/hooks/usePageKeyProblem'
import { PageKeyField } from './PageKeyField'

interface FormValues {
  title: string
  page_key: string
  parent_key: string
  show_in_menu: boolean
  is_public: boolean
  seo_title: string
  seo_description: string
  noindex: boolean
}

const valuesOf = (page: Page): FormValues => ({
  title: page.title,
  page_key: page.page_key,
  parent_key: page.parent_key ?? '',
  show_in_menu: page.show_in_menu,
  is_public: page.is_public,
  seo_title: page.seo_title ?? '',
  seo_description: page.seo_description ?? '',
  noindex: page.noindex,
})

/** 바뀐 칸만 보낸다 — 템플릿 기본 페이지는 주소 · 상위 · 메뉴 표시가 없다 */
const changedInput = (page: Page, values: FormValues): PageInput => {
  const before = valuesOf(page)
  const input: PageInput = {}
  for (const key of Object.keys(values) as (keyof FormValues)[]) {
    if (values[key] !== before[key]) Object.assign(input, { [key]: values[key] })
  }
  if (input.title !== undefined) input.title = input.title.trim()
  return input
}

interface PageSettingsFormProps {
  page: Page
  pages: Page[]
}

/** 페이지 설정 (T-238, 기획서 PM-02) — 아래 저장 막대 · 나가기 확인 */
export function PageSettingsForm({ page, pages }: PageSettingsFormProps) {
  const update = useUpdatePage()
  // 저장한 값 기준 — 저장 직후 목록을 다시 읽기 전에도 '바뀐 것 없음'이 되게
  const [base, setBase] = useState(page)
  const [values, setValues] = useState<FormValues>(() => valuesOf(page))
  const [keyError, setKeyError] = useState<string>()
  useEffect(() => {
    setBase(page)
    setValues(valuesOf(page))
    setKeyError(undefined)
  }, [page])

  const isCustom = page.origin === 'CUSTOM'
  const isHome = page.page_key === HOME_PAGE
  const input = useMemo(() => changedInput(base, values), [base, values])
  const dirty = Object.keys(input).length > 0
  const keyProblem = usePageKeyProblem(values.page_key, page.page_key)
  const hasChildren = pages.some((p) => p.parent_key === page.page_key)
  const blocked = !values.title.trim()
    ? '페이지 이름을 입력해 주세요.'
    : values.page_key !== page.page_key
      ? (pageKeyError(values.page_key) ?? keyProblem ?? keyError)
      : undefined

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }))

  const save = async (): Promise<boolean> => {
    if (!dirty || blocked) return false
    try {
      const saved = await update.mutateAsync({ id: page.id, ...input })
      setBase(saved)
      setValues(valuesOf(saved))
      // 주소가 바뀌면 페이지 편집 화면이 새 주소로 옮긴다
      toast.success(
        saved.page_key !== page.page_key
          ? '저장했어요. 이전 주소로 들어오면 새 주소로 이동하도록 기록했어요.'
          : '페이지 설정을 저장했어요.'
      )
      return true
    } catch (err) {
      const message = pickErrorMessage(err, '저장하지 못했어요.')
      const field = (err as { response?: { data?: { error?: { field?: string } } } })?.response
        ?.data?.error?.field
      if (field === 'page_key') setKeyError(message)
      else toast.error(message)
      return false
    }
  }

  return (
    <ReadOnlyFieldset className="min-w-0 space-y-6">
      <section className={SITE_CARD} aria-labelledby="page-basic">
        <h2 id="page-basic" className="font-semibold text-slate-900">
          기본
        </h2>
        <Input
          label="페이지 이름"
          required
          value={values.title}
          maxLength={30}
          onChange={(e) => set('title', e.target.value)}
          helperText="관리자 화면 · 메뉴 후보에 보이는 이름이에요."
        />
        {isCustom ? (
          <PageKeyField
            id="page-key"
            value={values.page_key}
            current={page.page_key}
            onChange={(value) => {
              set('page_key', value)
              setKeyError(undefined)
            }}
            error={keyError}
            helperText="바꾸면 이전 주소로 들어온 방문자를 새 주소로 보내요."
          />
        ) : (
          <p className="text-sm text-slate-500">
            템플릿 기본 페이지라 주소({isHome ? '/' : `/${page.page_key}`})와 상위 페이지는 바꿀 수
            없어요.
          </p>
        )}
        {isCustom && (
          <div className="space-y-1.5">
            <label htmlFor="page-parent-edit" className="text-sm font-medium text-slate-700">
              상위 페이지 (메뉴 묶음)
            </label>
            <select
              id="page-parent-edit"
              value={values.parent_key}
              disabled={hasChildren}
              onChange={(e) => set('parent_key', e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-50"
            >
              <option value="">없음 (맨 위)</option>
              {parentOptions(pages, page).map((p) => (
                <option key={p.id} value={p.page_key}>
                  {p.title}
                </option>
              ))}
            </select>
            {hasChildren && (
              <p className="text-xs text-slate-500">
                하위 페이지가 있어서 다른 페이지 아래로 옮길 수 없어요.
              </p>
            )}
          </div>
        )}
        {!isHome && (
          <div>
            <Toggle
              label="홈페이지에 공개"
              description="끄면 숨김 — 주소로 들어와도 보이지 않고 메뉴에서도 빠져요."
              checked={values.is_public}
              onChange={(e) => set('is_public', e.target.checked)}
            />
          </div>
        )}
        {isCustom && (
          <div>
            <Toggle
              label="메뉴에 표시"
              description="끄면 메뉴 기본 목록에서 빠져요. 메뉴 관리에서 직접 넣을 수는 있어요."
              checked={values.show_in_menu}
              onChange={(e) => set('show_in_menu', e.target.checked)}
            />
          </div>
        )}
      </section>

      <section className={SITE_CARD} aria-labelledby="page-seo">
        <div>
          <h2 id="page-seo" className="font-semibold text-slate-900">
            검색 노출 (SEO)
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            비워 두면 사이트 관리 &gt; SEO 설정 값을 써요.
          </p>
        </div>
        <Input
          label="검색 제목"
          value={values.seo_title}
          maxLength={60}
          onChange={(e) => set('seo_title', e.target.value)}
          helperText={`${values.seo_title.length} / 60`}
        />
        <Textarea
          label="검색 설명"
          value={values.seo_description}
          maxLength={160}
          rows={3}
          onChange={(e) => set('seo_description', e.target.value)}
          helperText={`${values.seo_description.length} / 160`}
        />
        <div>
          <Toggle
            label="검색 결과에서 제외"
            description="검색엔진이 이 페이지를 싣지 않도록 알려요."
            checked={values.noindex}
            onChange={(e) => set('noindex', e.target.checked)}
          />
        </div>
      </section>

      <SaveBar
        dirty={dirty}
        saving={update.isPending}
        error={blocked}
        onReset={() => {
          setValues(valuesOf(base))
          setKeyError(undefined)
        }}
        onSave={() => void save()}
      />
      <LeaveGuard dirty={dirty} onSave={save} saveBlockedReason={blocked} />
    </ReadOnlyFieldset>
  )
}
