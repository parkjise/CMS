import { useCallback, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  type PostTableLayout,
  toTableLayout,
  usePostTableLayoutStore,
} from '@/stores/postTableLayoutStore'

/** 바꾼 뒤 이만큼 더 바뀌지 않으면 서버에 보낸다 — 연달아 누르면 마지막 것만 */
export const SERVER_SAVE_DELAY_MS = 400

const layoutKey = (boardId: string) => ['me', 'preferences', 'post-table', boardId] as const

/**
 * 게시판 글 표 열 설정을 계정(서버)에 저장한다 (T-181).
 *
 * - 화면 · 이 브라우저(T-172)에는 바로 반영하고, 서버에는 잠시 뒤 보낸다
 * - 서버에 설정이 있으면 그것을 쓰고, 없는데 이 브라우저에 있으면 한 번 서버로 옮긴다
 * - 서버 저장이 실패해도 화면 · 브라우저 설정은 유지하고 다시 시도할 수 있다
 */
export function usePostTableLayoutSync(boardId: string, scope: string | null, enabled: boolean) {
  const queryClient = useQueryClient()
  const save = usePostTableLayoutStore((state) => state.save)
  const setServerFailed = usePostTableLayoutStore((state) => state.setServerFailed)
  const serverFailed = usePostTableLayoutStore((state) =>
    scope ? Boolean(state.serverFailed[scope]) : false
  )
  const query = useQuery({
    queryKey: layoutKey(boardId),
    queryFn: async (): Promise<PostTableLayout | null> => {
      const { data } = await api.get(`/v1/me/preferences/post-table/${boardId}`)
      return toTableLayout(data?.data)
    },
    enabled: Boolean(scope) && enabled,
    staleTime: Infinity,
    retry: false,
  })

  const push = useCallback(
    async (layout: PostTableLayout | null) => {
      if (!scope) return
      const url = `/v1/me/preferences/post-table/${boardId}`
      try {
        if (layout) await api.put(url, layout)
        else await api.delete(url)
        queryClient.setQueryData(layoutKey(boardId), layout)
        setServerFailed(scope, false)
      } catch {
        setServerFailed(scope, true)
      }
    },
    [boardId, scope, queryClient, setServerFailed]
  )

  // 서버 설정을 화면에 — 없으면 이 브라우저 설정을 한 번 옮긴다
  const migrated = useRef<string | null>(null)
  useEffect(() => {
    if (!scope || !query.isSuccess) return
    if (query.data) {
      save(scope, query.data)
      return
    }
    const local = usePostTableLayoutStore.getState().layouts[scope]
    if (local && migrated.current !== scope) {
      migrated.current = scope
      void push(local)
    }
  }, [scope, query.isSuccess, query.data, save, push])

  useEffect(() => {
    if (scope && query.isError) setServerFailed(scope, true)
  }, [scope, query.isError, setServerFailed])

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  const persist = useCallback(
    (layout: PostTableLayout | null) => {
      if (!scope) return
      save(scope, layout)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void push(layout), SERVER_SAVE_DELAY_MS)
    },
    [scope, save, push]
  )

  /** 지금 화면 설정을 다시 보낸다 */
  const retry = useCallback(() => {
    if (!scope) return
    const current = usePostTableLayoutStore.getState().layouts[scope] ?? null
    if (query.isError) void query.refetch()
    void push(current)
  }, [scope, push, query])

  return { persist, retry, serverFailed }
}
