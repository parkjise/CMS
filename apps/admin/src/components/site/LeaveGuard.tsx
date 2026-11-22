import { useEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router'
import { Button, Modal } from '@cms/ui'
import { useCanEdit } from '@/hooks/useCanEdit'

interface LeaveGuardProps {
  dirty: boolean
  /** 그 화면의 저장 — 성공하면 true. 없으면 [저장하고 이동] 없이 두 가지만 */
  onSave?: () => Promise<boolean>
  /** 저장할 수 없는 까닭 — 있으면 [저장하고 이동]을 끄고 보여 준다 (저장 막대와 같은 문구) */
  saveBlockedReason?: string
  /** 안내 문구 — 저장 기능이 없는 화면(게시판 만들기 등)은 그 화면에 맞게 */
  message?: string
}

/**
 * 저장 안 한 채 다른 화면으로 가면 묻는다 (T-221 → T-227) — 데이터 라우터 안에서만.
 * 창 닫기 · 새로고침은 브라우저가 직접 묻는 확인 그대로.
 */
export function LeaveGuard({
  dirty,
  onSave,
  saveBlockedReason,
  message = '이 화면에서 바꾼 내용을 아직 저장하지 않았어요.',
}: LeaveGuardProps) {
  const canEdit = useCanEdit()
  const [saving, setSaving] = useState(false)
  // 이동을 고른 뒤 다음 화면이 뜨기 전 새로고침해도 다시 묻지 않게
  const leaving = useRef(false)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname
  )

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      if (!leaving.current) event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const proceed = () => {
    leaving.current = true
    blocker.proceed?.()
  }

  const stay = () => {
    if (!saving && blocker.state === 'blocked') blocker.reset()
  }

  const saveAndLeave = async () => {
    if (!onSave) return
    setSaving(true)
    const ok = await onSave()
    setSaving(false)
    // 실패하면 화면에 남는다 — 오류 알림은 저장 쪽이 띄우고 입력은 그대로
    if (blocker.state !== 'blocked') return
    if (ok) proceed()
    else blocker.reset()
  }

  return (
    <Modal
      open={blocker.state === 'blocked'}
      onClose={stay}
      title="저장하지 않은 변경사항"
      size="md"
    >
      <p className="text-sm text-slate-600">{message}</p>
      {saveBlockedReason && (
        <p className="mt-2 text-sm text-rose-600" role="alert">
          {saveBlockedReason}
        </p>
      )}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" disabled={saving} onClick={stay}>
          계속 편집
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={saving}
          onClick={() => blocker.state === 'blocked' && proceed()}
        >
          저장하지 않고 이동
        </Button>
        {onSave && canEdit && (
          <Button
            type="button"
            loading={saving}
            disabled={Boolean(saveBlockedReason)}
            onClick={() => void saveAndLeave()}
          >
            저장하고 이동
          </Button>
        )}
      </div>
    </Modal>
  )
}
