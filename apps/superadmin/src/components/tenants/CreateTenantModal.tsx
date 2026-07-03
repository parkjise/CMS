import { useState } from 'react'
import { Button, Input, Modal, toast } from '@cms/ui'
import { PLAN_TYPES } from '@/lib/plans'
import { useCreateTenant } from '@/hooks/useTenants'

interface Props {
  open: boolean
  onClose: () => void
}

const EMPTY = {
  name: '',
  slug: '',
  template_type: 'GENERAL',
  plan_type: 'BASIC',
  admin_email: '',
  admin_password: '',
}

export function CreateTenantModal({ open, onClose }: Props) {
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const create = useCreateTenant()

  const set = (k: keyof typeof EMPTY, v: string) =>
    setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    setError('')
    if (!form.name || !form.slug || !form.admin_email || !form.admin_password) {
      setError('필수 항목을 모두 입력하세요.')
      return
    }
    if (form.admin_password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.')
      return
    }
    try {
      await create.mutateAsync(form)
      toast.success('테넌트가 생성되었습니다.')
      setForm(EMPTY)
      onClose()
    } catch {
      setError('생성에 실패했습니다. slug 중복 여부를 확인하세요.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="신규 테넌트 생성">
      <div className="space-y-3">
        <Input
          label="사업체명"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
        />
        <Input
          label="slug (URL 식별자)"
          value={form.slug}
          onChange={(e) => set('slug', e.target.value.toLowerCase())}
          helperText="영문 소문자·숫자·하이픈"
        />
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            플랜
          </label>
          <select
            value={form.plan_type}
            onChange={(e) => set('plan_type', e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {PLAN_TYPES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <Input
          label="관리자 이메일"
          type="email"
          value={form.admin_email}
          onChange={(e) => set('admin_email', e.target.value)}
        />
        <Input
          label="관리자 초기 비밀번호"
          type="password"
          value={form.admin_password}
          onChange={(e) => set('admin_password', e.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button onClick={handleSubmit} loading={create.isPending}>
            생성
          </Button>
        </div>
      </div>
    </Modal>
  )
}
