import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { Copy, Trash2 } from 'lucide-react'
import { Button, Modal, Textarea, toast } from '@cms/ui'
import {
  type InquiryStatus,
  useDeleteInquiry,
  useInquiry,
  useUpdateInquiry,
} from '@/hooks/useInquiries'
import { STATUS_OPTIONS, StatusBadge, TYPE_LABELS } from './StatusBadge'

interface InquiryDetailModalProps {
  inquiryId: string | null
  onClose: () => void
}

export function InquiryDetailModal({
  inquiryId,
  onClose,
}: InquiryDetailModalProps) {
  const inquiryQuery = useInquiry(inquiryId)
  const updateMutation = useUpdateInquiry()
  const deleteMutation = useDeleteInquiry()

  const [memo, setMemo] = useState('')
  const [status, setStatus] = useState<InquiryStatus>('PENDING')

  // 데이터 도착 시 폼 동기화 + 자동 읽음 처리
  useEffect(() => {
    if (!inquiryQuery.data) return
    setMemo(inquiryQuery.data.admin_memo ?? '')
    setStatus(inquiryQuery.data.status)

    // 미확인이면 백그라운드로 읽음 처리
    if (!inquiryQuery.data.is_read) {
      updateMutation.mutate({
        id: inquiryQuery.data.id,
        payload: { is_read: true },
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inquiryQuery.data?.id])

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label}을(를) 복사했습니다.`)
    } catch {
      toast.error('복사에 실패했습니다.')
    }
  }

  const handleSave = async () => {
    if (!inquiryId) return
    try {
      await updateMutation.mutateAsync({
        id: inquiryId,
        payload: { status, admin_memo: memo || null },
      })
      toast.success('문의를 저장했습니다.')
      onClose()
    } catch {
      toast.error('저장에 실패했습니다.')
    }
  }

  const handleDelete = async () => {
    if (!inquiryId) return
    if (!window.confirm('이 문의를 삭제하시겠습니까? 복구할 수 없습니다.')) return
    try {
      await deleteMutation.mutateAsync(inquiryId)
      toast.success('문의를 삭제했습니다.')
      onClose()
    } catch {
      toast.error('삭제에 실패했습니다.')
    }
  }

  return (
    <Modal
      open={Boolean(inquiryId)}
      onClose={onClose}
      title="문의 상세"
      size="xl"
    >
      {inquiryQuery.isLoading && (
        <div className="space-y-3 py-4">
          <div className="h-6 w-1/2 animate-pulse rounded bg-slate-100" />
          <div className="h-24 animate-pulse rounded bg-slate-100" />
        </div>
      )}

      {inquiryQuery.data && (
        <div className="space-y-5">
          {/* 메타 영역 */}
          <div className="grid grid-cols-1 gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
            <Field
              label="이름"
              value={inquiryQuery.data.name}
              onCopy={() => handleCopy(inquiryQuery.data.name, '이름')}
            />
            <Field
              label="유형"
              value={
                TYPE_LABELS[inquiryQuery.data.inquiry_type] ??
                inquiryQuery.data.inquiry_type
              }
            />
            <Field
              label="연락처"
              value={inquiryQuery.data.phone}
              onCopy={() => handleCopy(inquiryQuery.data.phone, '연락처')}
            />
            <Field
              label="이메일"
              value={inquiryQuery.data.email ?? '-'}
              onCopy={
                inquiryQuery.data.email
                  ? () => handleCopy(inquiryQuery.data!.email!, '이메일')
                  : undefined
              }
            />
            <Field
              label="접수 시각"
              value={dayjs(inquiryQuery.data.created_at).format(
                'YYYY-MM-DD HH:mm'
              )}
            />
            <div className="space-y-1">
              <span className="text-xs font-medium text-slate-500">현재 상태</span>
              <div>
                <StatusBadge status={inquiryQuery.data.status} />
              </div>
            </div>
          </div>

          {/* 메시지 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              문의 내용
            </label>
            <div className="whitespace-pre-wrap rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-800">
              {inquiryQuery.data.message}
            </div>
          </div>

          {/* 상태 변경 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              상태 변경
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as InquiryStatus)}
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* 관리자 메모 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              관리자 메모
            </label>
            <Textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={4}
              placeholder="내부 메모를 남기세요. 고객에게는 표시되지 않습니다."
            />
          </div>

          {/* 액션 */}
          <div className="flex items-center justify-between border-t border-slate-200 pt-4">
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
              삭제
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={updateMutation.isPending}
              >
                닫기
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? '저장 중...' : '저장'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

interface FieldProps {
  label: string
  value: string
  onCopy?: () => void
}

function Field({ label, value, onCopy }: FieldProps) {
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <div className="flex items-center gap-2">
        <span className="truncate text-sm font-medium text-slate-900">
          {value}
        </span>
        {onCopy && (
          <button
            type="button"
            onClick={onCopy}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label={`${label} 복사`}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
