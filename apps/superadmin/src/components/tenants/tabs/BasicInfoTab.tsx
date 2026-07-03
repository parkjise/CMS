import { useEffect, useState } from 'react'
import { Button, Input, Toggle, toast } from '@cms/ui'
import { PLAN_TYPES } from '@/lib/plans'
import {
  useChangePlan,
  useResetPassword,
  useUpdateTenant,
  type TenantDetail,
} from '@/hooks/useTenant'

interface Props {
  tenant: TenantDetail
}

export function BasicInfoTab({ tenant }: Props) {
  const [name, setName] = useState(tenant.name)
  const [domain, setDomain] = useState(tenant.custom_domain ?? '')
  const [active, setActive] = useState(tenant.is_active)
  const [plan, setPlan] = useState(tenant.plan_type)

  useEffect(() => {
    setName(tenant.name)
    setDomain(tenant.custom_domain ?? '')
    setActive(tenant.is_active)
    setPlan(tenant.plan_type)
  }, [tenant])

  const update = useUpdateTenant(tenant.id)
  const changePlan = useChangePlan(tenant.id)
  const resetPw = useResetPassword(tenant.id)

  const handleSaveInfo = async () => {
    await update.mutateAsync({
      name,
      custom_domain: domain || null,
      is_active: active,
    })
    toast.success('기본 정보가 저장되었습니다.')
  }

  const handleChangePlan = async () => {
    await changePlan.mutateAsync(plan)
    toast.success('플랜이 변경되었습니다.')
  }

  const handleReset = async () => {
    const res = await resetPw.mutateAsync()
    toast.success(`임시 비밀번호: ${res.temporary_password}`)
  }

  return (
    <div className="max-w-lg space-y-6">
      <section className="space-y-3">
        <Input label="사업체명" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          label="커스텀 도메인"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="example.com"
        />
        <Toggle
          label="활성 상태"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        <Button onClick={handleSaveInfo} loading={update.isPending}>
          정보 저장
        </Button>
      </section>

      <section className="space-y-2 border-t border-slate-100 pt-5">
        <h3 className="text-sm font-semibold text-slate-800">플랜 변경</h3>
        <div className="flex items-center gap-2">
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {PLAN_TYPES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            onClick={handleChangePlan}
            loading={changePlan.isPending}
            disabled={plan === tenant.plan_type}
          >
            플랜 변경
          </Button>
        </div>
      </section>

      <section className="space-y-2 border-t border-slate-100 pt-5">
        <h3 className="text-sm font-semibold text-slate-800">관리자 비밀번호</h3>
        <p className="text-xs text-slate-500">
          {tenant.admin_emails.join(', ') || '관리자 계정 없음'}
        </p>
        <Button variant="danger" onClick={handleReset} loading={resetPw.isPending}>
          비밀번호 초기화
        </Button>
      </section>
    </div>
  )
}
