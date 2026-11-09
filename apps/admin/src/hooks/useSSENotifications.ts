import { useEffect, useRef, useState } from 'react'
import { toast } from '@cms/ui'
import { useAuthStore } from '@/stores/authStore'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api'
const RECONNECT_DELAY_MS = 3000

export interface NewInquiryEvent {
  type: 'new_inquiry'
  id: string
  name: string
  inquiry_type: string
}

/** 회원이 홈페이지에서 쓴 새 글 (T-151-A) — 게시판 운영 설정에서 켠 곳만 */
export interface NewPostEvent {
  type: 'new_post'
  board_id: string
  board_name: string
  post_id: string
  title: string
}

/** 홈페이지에서 글이 신고됨 (T-175) — hidden 이면 기준을 넘어 자동 비공개됨 */
export interface NewReportEvent {
  type: 'new_report'
  board_id: string
  board_name: string
  post_id: string
  title: string
  hidden: boolean
}

interface ConnectedEvent {
  type: 'connected'
}

type SSEMessage = NewInquiryEvent | NewPostEvent | NewReportEvent | ConnectedEvent

/** 브라우저 알림 권한이 있으면 시스템 알림, 없으면 화면 안 토스트 */
function announce(title: string, body: string, fallback: string) {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' })
  } else {
    toast.info(fallback)
  }
}

interface UseSSENotificationsOptions {
  onNewInquiry?: (event: NewInquiryEvent) => void
  enabled?: boolean
}

export interface UseSSENotificationsResult {
  isConnected: boolean
  lastEvent: NewInquiryEvent | null
}

/**
 * SSE 실시간 알림 훅.
 * - 신규 문의 수신 시 onNewInquiry 콜백 + sonner toast + 브라우저 Notification
 * - 연결 끊김 시 RECONNECT_DELAY_MS 후 자동 재연결
 * - 컴포넌트 언마운트 시 EventSource close
 */
export function useSSENotifications(
  options: UseSSENotificationsOptions = {}
): UseSSENotificationsResult {
  const { onNewInquiry, enabled = true } = options
  const accessToken = useAuthStore((s) => s.accessToken)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const [isConnected, setIsConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<NewInquiryEvent | null>(null)

  const esRef = useRef<EventSource | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onNewInquiryRef = useRef(onNewInquiry)

  // 콜백 최신화 (재연결 사이클에서도 최신 콜백 사용)
  useEffect(() => {
    onNewInquiryRef.current = onNewInquiry
  }, [onNewInquiry])

  useEffect(() => {
    if (!enabled || !isAuthenticated || !accessToken) {
      return
    }

    // 브라우저 알림 권한이 default면 요청 (한 번만)
    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'default'
    ) {
      Notification.requestPermission().catch(() => {
        // 사용자가 거부해도 toast로 대체되므로 무시
      })
    }

    let stopped = false

    const connect = () => {
      if (stopped) return

      // EventSource는 헤더 미지원 → ?token= 쿼리로 전달
      const url = `${BASE_URL}/v1/notifications/stream?token=${encodeURIComponent(
        accessToken
      )}`
      const es = new EventSource(url)
      esRef.current = es

      es.onopen = () => {
        setIsConnected(true)
      }

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data) as SSEMessage
          if (data.type === 'new_inquiry') {
            setLastEvent(data)
            onNewInquiryRef.current?.(data)

            announce(
              '새 문의가 접수되었습니다',
              `${data.name}님 (${data.inquiry_type})`,
              `새 문의: ${data.name}님 (${data.inquiry_type})`,
            )
          } else if (data.type === 'new_post') {
            announce('새 글이 올라왔습니다', `${data.board_name} — ${data.title}`, `새 글: ${data.board_name} — ${data.title}`)
          } else if (data.type === 'new_report') {
            const note = data.hidden ? ' (신고가 쌓여 자동으로 숨김)' : ''
            announce(
              '신고된 글이 있습니다',
              `${data.board_name} — ${data.title}${note}`,
              `신고: ${data.board_name} — ${data.title}${note}`,
            )
          }
        } catch {
          // 잘못된 payload는 무시
        }
      }

      es.onerror = () => {
        setIsConnected(false)
        es.close()
        esRef.current = null

        // 3초 후 자동 재연결
        if (!stopped) {
          reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS)
        }
      }
    }

    connect()

    return () => {
      stopped = true
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
      setIsConnected(false)
    }
  }, [enabled, isAuthenticated, accessToken])

  return { isConnected, lastEvent }
}
