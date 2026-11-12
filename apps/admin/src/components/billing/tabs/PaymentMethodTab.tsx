import { useState } from 'react'
import { CreditCard, Trash2 } from 'lucide-react'
import { Button, toast } from '@cms/ui'
import { CARD_LOCKED_STATUSES, useDeleteCard, useSubscription } from '@/hooks/useBilling'
import { useCanEdit } from '@/hooks/useCanEdit'
import { pickErrorMessage } from '@/lib/errorMessages'
import { RegisterCardModal } from './RegisterCardModal'

export function PaymentMethodTab() {
  const { data: sub } = useSubscription()
  const deleteCard = useDeleteCard()
  const canEdit = useCanEdit()
  const [open, setOpen] = useState(false)

  const hasCard = Boolean(sub?.has_card)
  // 자동 결제 중에는 지울 수 없다 — 카드 변경 또는 구독 해지 뒤 (T-207, 사용자 결정)
  const locked = Boolean(sub && CARD_LOCKED_STATUSES.includes(sub.status))
  // 토스는 '신한' 처럼 보낸다 — 이미 '카드'로 끝나면 붙이지 않는다
  const company = sub?.card_company
  const cardLabel = company
    ? `${company.endsWith('카드') ? company : `${company}카드`}${sub?.card_last4 ? ` **** ${sub.card_last4}` : ''}`
    : '등록된 카드'

  const handleDelete = async () => {
    if (!window.confirm(`${cardLabel}를 결제 수단에서 삭제할까요?`)) return
    try {
      await deleteCard.mutateAsync()
      toast.success('결제 수단을 삭제했습니다.')
    } catch (e) {
      toast.error(pickErrorMessage(e, '결제 수단을 삭제하지 못했습니다.'))
    }
  }

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
                  <p className="text-sm font-medium text-slate-800">{cardLabel}</p>
                  <p className="text-xs text-slate-400">
                    {sub?.billing_name ? `${sub.billing_name} · ` : ''}영수증:{' '}
                    {sub?.billing_email ?? '—'}
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-500">등록된 결제 수단이 없습니다.</p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {hasCard && (
              <Button
                variant="secondary"
                onClick={handleDelete}
                disabled={!canEdit || locked || deleteCard.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                삭제
              </Button>
            )}
            <Button variant="secondary" onClick={() => setOpen(true)} disabled={!canEdit}>
              {hasCard ? '카드 변경' : '카드 등록'}
            </Button>
          </div>
        </div>
        {hasCard && locked && (
          <p className="mt-3 text-xs text-slate-500">
            자동 결제 중에는 카드를 삭제할 수 없어요. 다른 카드로 바꾸거나, 구독을 해지한 뒤 삭제할
            수 있어요.
          </p>
        )}
      </section>

      <RegisterCardModal open={open} onClose={() => setOpen(false)} />
    </div>
  )
}
