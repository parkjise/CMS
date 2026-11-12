import { useState } from 'react'
import dayjs from 'dayjs'
import { MessageCircle } from 'lucide-react'
import { Button, Textarea, toast } from '@cms/ui'
import { pickErrorMessage } from '@/lib/errorMessages'
import { type InquiryDetail, type ReplyChannel, useReplyInquiry } from '@/hooks/useInquiries'

const REPLY_MAX = 1000

// 조사까지 — 알림톡으로 · 문자로
const CHANNEL_VIA: Record<ReplyChannel, string> = {
  KAKAO: '알림톡으로',
  SMS: '문자로',
}

interface InquiryReplyPanelProps {
  inquiry: InquiryDetail
  open: boolean
  onClose: () => void
  /** 답장 뒤 바뀐 상태를 상세 폼에 반영 (저장해도 되돌아가지 않게) */
  onSent: (updated: InquiryDetail) => void
}

/** 문의자에게 알림톡으로 답장 (T-203, AD-04-M) — 알림톡이 안 되면 문자로 보낸다. */
export function InquiryReplyPanel({ inquiry, open, onClose, onSent }: InquiryReplyPanelProps) {
  const replyMutation = useReplyInquiry()
  const [message, setMessage] = useState('')
  const trimmed = message.trim()

  const handleSend = async () => {
    try {
      const result = await replyMutation.mutateAsync({
        id: inquiry.id,
        message: trimmed,
      })
      const via = CHANNEL_VIA[result.channel]
      toast.success(
        result.test_mode
          ? `${via} 답장했습니다. (테스트 모드 — 실제로 발송되지 않았습니다)`
          : `${via} 답장했습니다.`
      )
      setMessage('')
      onSent(result.inquiry)
      onClose()
    } catch (error) {
      toast.error(pickErrorMessage(error, '답장을 보내지 못했습니다.'))
    }
  }

  return (
    <div className="space-y-3">
      {inquiry.replied_at && inquiry.reply_message && (
        <section
          aria-label="보낸 답장"
          className="rounded-md border border-slate-200 bg-slate-50 p-3"
        >
          <p className="mb-1 text-xs font-medium text-slate-500">
            {dayjs(inquiry.replied_at).format('MM/DD HH:mm')}{' '}
            {CHANNEL_VIA[inquiry.reply_channel ?? 'KAKAO']} 답장함
          </p>
          <p className="whitespace-pre-wrap text-sm text-slate-800">{inquiry.reply_message}</p>
        </section>
      )}

      {open && (
        <section
          aria-label="알림톡 답장"
          className="space-y-3 rounded-md border border-amber-200 bg-amber-50/40 p-4"
        >
          <p className="text-sm text-slate-700">
            받는 사람{' '}
            <span className="font-medium text-slate-900">
              {inquiry.name} ({inquiry.phone})
            </span>
          </p>
          <div>
            <label
              htmlFor="inquiry-reply"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              답장 내용
            </label>
            <Textarea
              id="inquiry-reply"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={REPLY_MAX}
              rows={5}
              placeholder="고객에게 카카오톡으로 보낼 답장을 입력하세요."
            />
            <p className="mt-1 text-right text-xs text-slate-500">
              {message.length.toLocaleString()} / {REPLY_MAX.toLocaleString()}자
            </p>
          </div>

          {trimmed && (
            <div aria-label="답장 미리보기">
              <p className="mb-1 text-xs font-medium text-slate-500">카카오톡 미리보기</p>
              <div className="max-w-sm rounded-lg bg-[#FEE500]/30 p-3 text-sm text-slate-800">
                <p className="mb-1 font-medium">{inquiry.name}님, 문의에 답변드립니다.</p>
                <p className="whitespace-pre-wrap">{trimmed}</p>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500">
            알림톡을 보낼 수 없으면 문자로 보냅니다. 이번 달 알림 발송 건수에 포함됩니다.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={replyMutation.isPending}
            >
              취소
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSend}
              disabled={!trimmed || replyMutation.isPending}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              {replyMutation.isPending ? '보내는 중...' : '보내기'}
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}
