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

interface ConnectedEvent {
  type: 'connected'
}

type SSEMessage = NewInquiryEvent | ConnectedEvent

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

            // 브라우저 Notification
            if (
              typeof Notification !== 'undefined' &&
              Notification.permission === 'granted'
            ) {
              new Notification('새 문의가 접수되었습니다', {
                body: `${data.name}님 (${data.inquiry_type})`,
                icon: '/favicon.ico',
              })
            } else {
              // 권한 없으면 sonner toast로 대체
              toast.info(`새 문의: ${data.name}님 (${data.inquiry_type})`)
            }
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
