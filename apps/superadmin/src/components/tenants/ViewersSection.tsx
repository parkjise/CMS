import { useState, type FormEvent } from 'react'
import { Button, Input, toast } from '@cms/ui'
import { apiErrorMessage } from '@/lib/errors'
import { useCreateViewer, useRemoveViewer, useTenantViewers } from '@/hooks/useTenant'

interface ViewersSectionProps {
  tenantId: string
}

/** 보기 전용 계정 추가 · 삭제 (T-130) — 임시 비밀번호는 만들 때 한 번만 보여 준다 */
export const ViewersSection = ({ tenantId }: ViewersSectionProps) => {
  const viewers = useTenantViewers(tenantId)
  const create = useCreateViewer(tenantId)
  const remove = useRemoveViewer(tenantId)
  const [email, setEmail] = useState('')
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null)

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const res = await create.mutateAsync(email.trim())
      setIssued({ email: res.viewer.email, password: res.temporary_password })
      setEmail('')
    } catch (err) {
      toast.error(apiErrorMessage(err, '계정을 추가하지 못했습니다.'))
    }
  }

  const handleRemove = async (userId: string) => {
    try {
      await remove.mutateAsync(userId)
    } catch (err) {
      toast.error(apiErrorMessage(err, '계정을 삭제하지 못했습니다.'))
    }
  }

  return (
    <section className="space-y-3 border-t border-slate-100 pt-5">
      <h3 className="text-sm font-semibold text-slate-800">보기 전용 계정</h3>
      <p className="text-xs text-slate-500">관리자 화면을 조회만 할 수 있는 계정입니다.</p>

      <ul className="space-y-2">
        {viewers.data?.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-2 text-sm text-slate-700">
            <span className="truncate">{v.email}</span>
            <Button
              variant="danger"
              size="sm"
              aria-label={`${v.email} 삭제`}
              onClick={() => handleRemove(v.id)}
              loading={remove.isPending}
            >
              삭제
            </Button>
          </li>
        ))}
      </ul>

      <form onSubmit={handleCreate} className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            label="이메일"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button type="submit" loading={create.isPending}>
          계정 추가
        </Button>
      </form>

      {issued && (
        <p role="status" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          {issued.email} 임시 비밀번호: <code>{issued.password}</code> — 지금만 볼 수 있습니다.
        </p>
      )}
    </section>
  )
}
