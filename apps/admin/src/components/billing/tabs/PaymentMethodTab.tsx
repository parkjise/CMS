import { useState } from 'react'
import { CreditCard } from 'lucide-react'
import { Button } from '@cms/ui'
import { useSubscription } from '@/hooks/useBilling'
import { RegisterCardModal } from './RegisterCardModal'

export function PaymentMethodTab() {
  const { data: sub } = useSubscription()
  const [open, setOpen] = useState(false)

  const hasCard = !!sub?.billing_name || !!sub?.billing_email

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
              <CreditCard className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            </div>
            <div>
              {hasCard ? (
                <>
                  <p className="text-sm font-medium text-slate-800">
                    {sub?.billing_name ?? '등록된 카드'}
                  </p>
                  <p className="text-xs text-slate-400">
                    영수증: {sub?.billing_email ?? '—'}
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-500">
                  등록된 결제 수단이 없습니다.
                </p>
              )}
            </div>
          </div>
          <Button variant="secondary" onClick={() => setOpen(true)}>
            {hasCard ? '카드 변경' : '카드 등록'}
          </Button>
        </div>
      </section>

      <RegisterCardModal open={open} onClose={() => setOpen(false)} />
    </div>
  )
}
