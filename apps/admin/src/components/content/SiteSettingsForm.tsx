import { useEffect, useMemo, useState } from 'react'
import { Building2, Clock, Copy, Eye, ShieldCheck } from 'lucide-react'
import type { DayHours, DayStatus, PublicFieldGroup, WeekdayKey, WeeklyHours } from '@cms/types'
import { Input, Toggle, toast } from '@cms/ui'
import { FormField } from '@/components/content/forms/FormField'
import { ImageUploadField } from '@/components/content/forms/ImageUploadField'
import { LeaveGuard } from '@/components/site/LeaveGuard'
import { SaveBar } from '@/components/site/SaveBar'
import { SITE_CARD } from '@/components/site/SitePage'
import {
  type SiteSettings,
  type SiteSettingsField,
  type SiteSettingsUpdate,
  useSiteSettings,
  useUpdateSiteSettings,
} from '@/hooks/useSiteSettings'
import { pickErrorMessage } from '@/lib/errorMessages'
import { DAY_LABEL, WEEKDAYS, defaultWeek, hasWeeklyHours, weeklyRows } from '@/lib/siteHours'

/**
 * 사이트 관리 → 사이트 기본정보 (기획서 AD-02-A, T-036-A · T-221 · T-222 / 사이트 관리 SM-01)
 * 브랜드 · 사업자 · 연락처 · 운영시간을 한 번만 입력하면 홈페이지 푸터 · 상담 버튼 · 브라우저 탭 ·
 * 검색 구조화 데이터 · 약관 기본 문안에 함께 쓰인다. 숨긴 항목은 홈페이지 어디에도 나가지 않는다.
 */

const FIELDS: SiteSettingsField[] = [
  'site_name',
  'company_name',
  'logo_url',
  'favicon_url',
  'ceo',
  'business_number',
  'mail_order_number',
  'business_type',
  'business_item',
  'phone',
  'cs_phone',
  'fax',
  'email',
  'postal_code',
  'address',
  'address_detail',
  'parking',
  'hours_weekday',
  'hours_saturday',
  'hours_note',
  'hours_temp_note',
  'privacy_officer',
  'privacy_email',
  'copyright',
]

/** 공개 항목 선택 — 체크 = 홈페이지에 보임 */
const PUBLIC_OPTIONS: { key: PublicFieldGroup; label: string }[] = [
  { key: 'company_name', label: '회사명' },
  { key: 'ceo', label: '대표자' },
  { key: 'address', label: '주소' },
  { key: 'phone', label: '전화번호' },
  { key: 'fax', label: '팩스' },
  { key: 'email', label: '이메일' },
  { key: 'business', label: '사업자 정보' },
  { key: 'privacy_officer', label: '개인정보 보호책임자' },
]

type Week = Record<WeekdayKey, DayHours>

interface Draft {
  text: Record<SiteSettingsField, string>
  /** 고객센터 번호가 대표번호와 같음 — 따로 저장하지 않는다 */
  csSame: boolean
  /** 요일별 표를 쓰는지 — 끄면 예전 평일 · 토요일 글 */
  useWeek: boolean
  week: Week
  hidden: PublicFieldGroup[]
}

const fillWeek = (weekly: WeeklyHours | null | undefined): Week => {
  const base = defaultWeek()
  return Object.fromEntries(WEEKDAYS.map((d) => [d, weekly?.[d] ?? base[d]])) as Week
}

const toDraft = (s: SiteSettings | null | undefined): Draft => ({
  text: Object.fromEntries(FIELDS.map((f) => [f, s?.[f] ?? ''])) as Draft['text'],
  csSame: !s?.cs_phone,
  useWeek: hasWeeklyHours(s?.weekly_hours),
  week: fillWeek(s?.weekly_hours),
  hidden: s?.hidden_fields ?? [],
})

/** 저장 요청 — 빈 칸은 "" 로 지우기, 표를 껐으면 {} 로 지우기 */
const toPayload = (d: Draft): SiteSettingsUpdate => ({
  ...d.text,
  cs_phone: d.csSame ? '' : d.text.cs_phone,
  weekly_hours: d.useWeek ? d.week : {},
  hidden_fields: d.hidden,
})

/** 저장된 것과 같은지 — 표를 껐을 때 표 안의 값은 비교하지 않는다 */
const sameDraft = (a: Draft, b: Draft) =>
  JSON.stringify(toPayload(a)) === JSON.stringify(toPayload(b))

/** 400 응답의 칸 이름 · 메시지 */
const fieldError = (err: unknown): { field: string; message: string } | null => {
  const body = (err as { response?: { data?: { error?: { field?: string; message?: string } } } })
    ?.response?.data?.error
  return body?.field && body.message ? { field: body.field, message: body.message } : null
}

interface TextFieldProps {
  field: SiteSettingsField
  label: string
  placeholder?: string
  hint?: string
  type?: string
  value: string
  error?: string
  onChange: (field: SiteSettingsField, value: string) => void
}

function TextField({ field, label, placeholder, hint, type, value, error, onChange }: TextFieldProps) {
  const id = `site-${field}`
  return (
    <FormField label={label} htmlFor={id} hint={error ? undefined : hint}>
      {/* Input 의 error — 빨간 테두리 · aria-invalid · 아래 안내 문구 */}
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        error={error}
        onChange={(e) => onChange(field, e.target.value)}
      />
    </FormField>
  )
}

const STATUS_LABEL: Record<DayStatus, string> = { open: '영업', closed: '휴무', '24h': '24시간' }
const TIME = 'h-9 w-[6.5rem] rounded-md border border-slate-300 px-2 text-sm disabled:bg-slate-50 disabled:text-slate-400'

interface DayRowProps {
  day: WeekdayKey
  hours: DayHours
  onChange: (hours: DayHours) => void
  onCopy: () => void
}

function DayRow({ day, hours, onChange, onCopy }: DayRowProps) {
  const label = DAY_LABEL[day]
  const open = hours.status === 'open'
  const set = (patch: Partial<DayHours>) => onChange({ ...hours, ...patch })
  const time = (key: 'open' | 'close' | 'break_start' | 'break_end', name: string) => (
    <input
      type="time"
      aria-label={`${label}요일 ${name}`}
      className={TIME}
      value={hours[key] ?? ''}
      disabled={!open}
      onChange={(e) => set({ [key]: e.target.value || null })}
    />
  )
  return (
    <tr className="border-b border-slate-100 align-middle">
      <th scope="row" className="py-2 pr-3 text-left font-medium text-slate-700">
        {label}
      </th>
      <td className="py-2 pr-3">
        <select
          aria-label={`${label}요일 운영 상태`}
          className="h-9 rounded-md border border-slate-300 px-2 text-sm"
          value={hours.status}
          onChange={(e) => {
            const status = e.target.value as DayStatus
            set(
              status === 'open'
                ? { status, open: hours.open ?? '09:00', close: hours.close ?? '18:00' }
                : { status },
            )
          }}
        >
          {(Object.keys(STATUS_LABEL) as DayStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 pr-3">
        <span className="flex items-center gap-1">
          {time('open', '여는 시각')} ~ {time('close', '닫는 시각')}
        </span>
      </td>
      <td className="py-2 pr-3">
        <span className="flex items-center gap-1">
          {time('break_start', '점심 시작')} ~ {time('break_end', '점심 끝')}
        </span>
      </td>
      <td className="py-2 text-right">
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-blue-600 hover:underline"
          aria-label={`${label}요일 시간을 모든 요일에 복사`}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
          모든 요일에
        </button>
      </td>
    </tr>
  )
}

interface FooterPreviewProps {
  draft: Draft
}

/** 공개로 둔 항목만 홈페이지 푸터처럼 — 실제 모양은 템플릿마다 조금씩 다르다 */
function FooterPreview({ draft }: FooterPreviewProps) {
  const t = draft.text
  const shown = (group: PublicFieldGroup) => !draft.hidden.includes(group)
  const company = [
    (shown('company_name') && t.company_name) || t.site_name || '사이트명',
    shown('ceo') && t.ceo && `대표자 ${t.ceo}`,
    shown('business') && t.business_number && `사업자등록번호 ${t.business_number}`,
    shown('business') && t.mail_order_number && `통신판매업 신고번호 ${t.mail_order_number}`,
    shown('business') &&
      (t.business_type || t.business_item) &&
      `업태 · 종목 ${[t.business_type, t.business_item].filter(Boolean).join(' / ')}`,
  ].filter(Boolean)
  const address = shown('address')
    ? [t.postal_code && `(${t.postal_code})`, t.address, t.address_detail].filter(Boolean).join(' ')
    : ''
  const contact = [
    shown('phone') && t.phone && `TEL ${t.phone}`,
    shown('phone') && !draft.csSame && t.cs_phone && `고객센터 ${t.cs_phone}`,
    shown('fax') && t.fax && `FAX ${t.fax}`,
    shown('email') && t.email,
  ].filter(Boolean)
  const hours = draft.useWeek
    ? weeklyRows(draft.week).map((r) => `${r.days} ${r.time}`)
    : [t.hours_weekday && `평일 ${t.hours_weekday}`, t.hours_saturday && `토요일 ${t.hours_saturday}`].filter(
        Boolean,
      )
  const officer =
    shown('privacy_officer') && t.privacy_officer
      ? `개인정보 보호책임자 ${t.privacy_officer}${t.privacy_email ? ` (${t.privacy_email})` : ''}`
      : ''
  return (
    <div
      className="space-y-1 rounded-lg bg-slate-800 px-4 py-4 text-xs leading-relaxed text-slate-300"
      data-testid="footer-preview"
      aria-label="푸터 미리보기"
    >
      <p>{company.join(' | ')}</p>
      {address && <p>{address}</p>}
      {contact.length > 0 && <p>{contact.join(' · ')}</p>}
      {(hours.length > 0 || t.hours_note || t.hours_temp_note) && (
        <p>{[...hours, t.hours_note, t.hours_temp_note].filter(Boolean).join(' · ')}</p>
      )}
      {officer && <p>{officer}</p>}
      <p className="text-slate-400">{t.copyright || `© ${t.site_name || '사이트명'}`}</p>
    </div>
  )
}

export function SiteSettingsForm() {
  const query = useSiteSettings()
  const save = useUpdateSiteSettings()
  const saved = useMemo(() => toDraft(query.data), [query.data])
  const [draft, setDraft] = useState<Draft>(() => toDraft(null))
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})
  const dirty = query.data !== undefined && !sameDraft(draft, saved)

  useEffect(() => {
    if (query.data !== undefined) setDraft(toDraft(query.data))
  }, [query.data])

  const change = (field: SiteSettingsField, value: string) => {
    setDraft((d) => ({ ...d, text: { ...d.text, [field]: value } }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }
  const setDay = (day: WeekdayKey, hours: DayHours) => {
    setDraft((d) => ({ ...d, week: { ...d.week, [day]: hours } }))
    setErrors((e) => ({ ...e, weekly_hours: undefined }))
  }
  const copyDay = (day: WeekdayKey) =>
    setDraft((d) => ({
      ...d,
      week: Object.fromEntries(WEEKDAYS.map((w) => [w, { ...d.week[day] }])) as Week,
    }))
  const togglePublic = (group: PublicFieldGroup, show: boolean) =>
    setDraft((d) => ({
      ...d,
      hidden: show ? d.hidden.filter((g) => g !== group) : [...d.hidden, group],
    }))

  // 성공 여부를 돌려준다 — 나가기 확인의 [저장하고 이동] (T-227)
  const handleSave = async () => {
    try {
      await save.mutateAsync(toPayload(draft))
      setErrors({})
      toast.success('사이트 기본정보를 저장했습니다. 홈페이지에 바로 반영돼요.')
      return true
    } catch (err) {
      const fe = fieldError(err)
      if (fe?.field.startsWith('weekly_hours')) {
        const day = fe.field.split('.')[1] as WeekdayKey | undefined
        const prefix = day && DAY_LABEL[day] ? `${DAY_LABEL[day]}요일: ` : ''
        setErrors({ weekly_hours: `${prefix}${fe.message}` })
      } else if (fe && (FIELDS as string[]).includes(fe.field)) {
        setErrors({ [fe.field]: fe.message })
        document.getElementById(`site-${fe.field}`)?.focus()
      }
      toast.error(pickErrorMessage(err, '저장하지 못했습니다.'))
      return false
    }
  }

  if (query.isLoading) {
    return (
      <div
        role="status"
        aria-label="사이트 기본정보 불러오는 중"
        className="h-96 animate-pulse rounded-lg bg-slate-100"
      />
    )
  }

  const field = (name: SiteSettingsField) => ({
    field: name,
    value: draft.text[name],
    error: errors[name],
    onChange: change,
  })
  const heading = 'flex items-center gap-2 text-base font-semibold text-slate-900'
  const icon = 'h-4 w-4 text-slate-500'

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (dirty) handleSave()
      }}
    >
      <section className={SITE_CARD} aria-labelledby="site-brand">
        <h2 id="site-brand" className={heading}>
          <Building2 className={icon} aria-hidden="true" /> 브랜드 정보
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField
            {...field('site_name')}
            label="사이트명"
            placeholder="바른치과 공식 사이트"
            hint="홈페이지 맨 위 · 브라우저 탭 · 검색 결과 이름. 비우면 사업체 이름을 써요."
          />
          <TextField
            {...field('company_name')}
            label="회사명 · 상호명"
            placeholder="주식회사 예시"
            hint="푸터 · 약관에 쓰여요. 비우면 사업체 이름을 써요."
          />
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <ImageUploadField
            label="로고"
            context="site"
            value={draft.text.logo_url}
            onChange={(url) => change('logo_url', url)}
            hint="홈페이지 맨 위에 상호 대신 보여요. 가로로 긴 이미지(예: 400×120)를 권장해요."
          />
          <ImageUploadField
            label="파비콘 (브라우저 탭 아이콘)"
            context="site"
            value={draft.text.favicon_url}
            onChange={(url) => change('favicon_url', url)}
            hint="정사각형 이미지(예: 512×512)를 권장해요."
          />
        </div>
        {(errors.logo_url || errors.favicon_url) && (
          <p className="text-xs text-rose-600" role="alert">
            {errors.logo_url ?? errors.favicon_url}
          </p>
        )}
      </section>

      <section className={SITE_CARD} aria-labelledby="site-business">
        <h2 id="site-business" className={heading}>
          <Building2 className={icon} aria-hidden="true" /> 사업자 · 연락처 정보
        </h2>
        <p className="text-sm text-slate-500">
          비워 둔 칸은 홈페이지에 보이지 않아요. 사업자등록번호는 형식만 확인하며 실제 사업자
          확인은 하지 않아요.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField {...field('ceo')} label="대표자" placeholder="홍길동" hint="공동대표는 쉼표로 함께 적어 주세요." />
          <TextField
            {...field('business_number')}
            label="사업자등록번호"
            placeholder="123-45-67890"
            hint="숫자 10자리 — 하이픈은 자동으로 넣어요."
          />
          <TextField
            {...field('mail_order_number')}
            label="통신판매업 신고번호"
            placeholder="제2026-서울강남-00000호"
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField {...field('business_type')} label="업태" placeholder="정보통신업" />
            <TextField {...field('business_item')} label="종목" placeholder="소프트웨어 개발" />
          </div>
          <TextField {...field('phone')} label="대표 전화" placeholder="02-1234-5678" />
          <div className="space-y-2">
            {draft.csSame ? (
              <FormField label="고객센터 전화">
                <p className="text-sm text-slate-500">대표 전화와 같아요.</p>
              </FormField>
            ) : (
              <TextField {...field('cs_phone')} label="고객센터 전화" placeholder="1588-1234" />
            )}
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={draft.csSame}
                onChange={(e) => setDraft((d) => ({ ...d, csSame: e.target.checked }))}
              />
              대표번호와 동일
            </label>
          </div>
          <TextField {...field('fax')} label="팩스" placeholder="선택 입력" />
          <TextField {...field('email')} label="대표 이메일" type="email" placeholder="hello@example.com" />
          <TextField
            {...field('postal_code')}
            label="우편번호"
            placeholder="06236"
            hint="숫자 5자리"
          />
          <div className="hidden md:block" />
          <TextField {...field('address')} label="기본 주소" placeholder="서울특별시 강남구 테헤란로 123" />
          <TextField {...field('address_detail')} label="상세 주소" placeholder="4층" />
        </div>
        <TextField {...field('parking')} label="주차 안내" placeholder="건물 내 주차 2시간 무료" />
      </section>

      <section className={SITE_CARD} aria-labelledby="site-hours">
        <h2 id="site-hours" className={heading}>
          <Clock className={icon} aria-hidden="true" /> 운영시간
        </h2>
        <Toggle
          checked={draft.useWeek}
          onChange={(e) => setDraft((d) => ({ ...d, useWeek: e.target.checked }))}
          label="요일별로 입력하기"
          description="요일마다 영업 · 휴무 · 24시간과 점심시간을 정해요. 검색 결과의 영업시간 정보에도 쓰여요."
        />
        {draft.useWeek ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="py-2 font-medium">요일</th>
                    <th className="py-2 font-medium">운영 상태</th>
                    <th className="py-2 font-medium">영업시간</th>
                    <th className="py-2 font-medium">점심시간 (선택)</th>
                    <th className="py-2" aria-label="복사" />
                  </tr>
                </thead>
                <tbody>
                  {WEEKDAYS.map((day) => (
                    <DayRow
                      key={day}
                      day={day}
                      hours={draft.week[day]}
                      onChange={(h) => setDay(day, h)}
                      onCopy={() => copyDay(day)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {errors.weekly_hours ? (
              <p className="text-xs text-rose-600" role="alert">
                {errors.weekly_hours}
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                닫는 시각이 여는 시각보다 이르면 다음 날 새벽에 닫는 것으로 봐요. (예: 18:00 ~
                02:00)
              </p>
            )}
          </>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextField {...field('hours_weekday')} label="평일" placeholder="오전 9:00 - 오후 6:00" />
            <TextField {...field('hours_saturday')} label="토요일" placeholder="오전 9:00 - 오후 1:00" />
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField {...field('hours_note')} label="휴무일 안내" placeholder="일요일 및 공휴일 휴무" />
          <TextField {...field('hours_temp_note')} label="임시 운영 안내" placeholder="명절 휴무 등" />
        </div>
      </section>

      <section className={SITE_CARD} aria-labelledby="site-privacy">
        <h2 id="site-privacy" className={heading}>
          <ShieldCheck className={icon} aria-hidden="true" /> 개인정보 담당 · 표시 설정
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField
            {...field('privacy_officer')}
            label="개인정보 보호책임자"
            placeholder="담당자명 또는 부서"
            hint="개인정보처리방침 기본 문안에도 들어가요. 비우면 대표자를 써요."
          />
          <TextField
            {...field('privacy_email')}
            label="개인정보 문의 이메일"
            type="email"
            placeholder="privacy@example.com"
            hint="비우면 대표 이메일을 써요."
          />
        </div>
        <TextField
          {...field('copyright')}
          label="저작권 문구"
          placeholder="© Example. All rights reserved."
          hint="비우면 '© 올해 사이트명'으로 보여요."
        />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">홈페이지에 보일 항목</legend>
          <p className="text-xs text-slate-500">
            끈 항목은 홈페이지 화면 · 공개 API · 검색 구조화 데이터 · 약관 기본 문안에서 모두
            빠져요. 온라인으로 판매한다면 사업자 정보 · 대표자 · 주소 · 전화번호를 공개해야 할 수
            있어요.
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {PUBLIC_OPTIONS.map((option) => (
              <label key={option.key} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={!draft.hidden.includes(option.key)}
                  onChange={(e) => togglePublic(option.key, e.target.checked)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <Eye className="h-4 w-4 text-slate-500" aria-hidden /> 푸터 미리보기
          </h3>
          <FooterPreview draft={draft} />
        </div>
      </section>

      <SaveBar
        dirty={dirty}
        saving={save.isPending}
        onReset={() => {
          setDraft(saved)
          setErrors({})
        }}
        onSave={() => void handleSave()}
      />
      <LeaveGuard dirty={dirty} onSave={handleSave} />
    </form>
  )
}
