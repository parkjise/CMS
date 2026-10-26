'use client'

import { useState } from 'react'
import { useInquiries, useInquiryDetail } from '@/hooks/member/useMemberAccount'
import { formatDay } from '@/lib/memberFormat'
import { FormError } from '../fields'
import { AnswerBadge } from './StatusBadge'

const TYPE_LABELS: Record<string, string> = {
  RESERVATION: '예약',
  CONSULT: '온라인 상담',
  GENERAL: '문의',
}

const Detail = ({ slug, id }: { slug: string; id: string }) => {
  const detail = useInquiryDetail(slug, id)
  if (detail.isLoading) return <p className="text-sm text-[color:var(--color-text-muted)]">불러오는 중…</p>
  if (!detail.data) return <FormError message={detail.error?.message} />
  const d = detail.data
  return (
    <div className="space-y-3 border-t border-[color:var(--color-border)] pt-3 text-sm">
      <p className="whitespace-pre-line text-[color:var(--color-text-secondary)]">{d.message}</p>
      {d.answer ? (
        <div className="rounded-md bg-[var(--color-surface)] p-3">
          <p className="mb-1 text-xs font-semibold text-[color:var(--color-primary)]">
            답변 {d.answered_at ? `· ${formatDay(d.answered_at)}` : ''}
          </p>
          <p className="whitespace-pre-line text-[color:var(--color-text-primary)]">{d.answer}</p>
        </div>
      ) : (
        <p className="text-xs text-[color:var(--color-text-muted)]">아직 답변이 등록되지 않았습니다.</p>
      )}
    </div>
  )
}

/** 문의 내역 탭 (기획서 16.7 — AD-04 문의와 연동) */
const InquiriesTab = ({ slug }: { slug: string }) => {
  const inquiries = useInquiries(slug)
  const [openId, setOpenId] = useState<string | null>(null)
  const items = inquiries.data?.items ?? []

  return (
    <section className="space-y-3">
      <FormError message={inquiries.error?.message} />
      {inquiries.isLoading ? (
        <p className="text-sm text-[color:var(--color-text-muted)]">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-[color:var(--color-text-muted)]">문의 내역이 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((inquiry) => {
            const open = openId === inquiry.id
            return (
              <li key={inquiry.id} className="space-y-2 rounded-[var(--border-radius-card)] border border-[color:var(--color-border)] p-4">
                <AnswerBadge answered={inquiry.answered} />
                <p className="font-semibold text-[color:var(--color-text-primary)]">
                  {inquiry.subject ?? TYPE_LABELS[inquiry.inquiry_type] ?? '문의'}
                </p>
                <div className="flex items-center justify-between text-xs text-[color:var(--color-text-muted)]">
                  <span>
                    {TYPE_LABELS[inquiry.inquiry_type] ?? '문의'} · {formatDay(inquiry.created_at)} 접수
                  </span>
                  <button
                    type="button"
                    aria-expanded={open}
                    className="font-medium text-[color:var(--color-primary)]"
                    onClick={() => setOpenId(open ? null : inquiry.id)}
                  >
                    {open ? '닫기' : '상세보기'}
                  </button>
                </div>
                {open && <Detail slug={slug} id={inquiry.id} />}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default InquiriesTab
