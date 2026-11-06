'use client'

import { useEffect, useState } from 'react'
import type { PublicBoard } from '@cms/types'
import {
  MemberBoardDenied,
  MemberPostError,
  createMemberPost,
  deleteMemberPost,
  fetchMyPost,
  updateMemberPost,
} from '@/lib/memberBoard'
import { useIsMember, useMemberStore } from '@/lib/memberStore'

export const TITLE_MAX = 200
export const CONTENT_MAX = 5000

export type MemberFormState = 'checking' | 'login' | 'closed' | 'ready' | 'missing'

export interface MemberPostValues {
  title: string
  content: string
  categoryId: string
  isSecret: boolean
}

const EMPTY: MemberPostValues = { title: '', content: '', categoryId: '', isSecret: false }

/** 로그인 상태 — 회원 기능이 꺼졌으면 closed */
function useMemberReady(
  tenantSlug: string,
  memberEnabled: boolean
): 'checking' | 'login' | 'closed' | 'member' {
  const isMember = useIsMember(tenantSlug)
  const ready = useMemberStore((s) => s.slug === tenantSlug && s.status === 'ready')
  if (!memberEnabled) return 'closed'
  if (!ready) return 'checking'
  return isMember ? 'member' : 'login'
}

/**
 * 홈페이지 회원 글쓰기 · 고치기 폼 (T-150-B) — postId 가 있으면 내 글을 불러와 고친다.
 * 서버가 다시 검사한다: 로그인 · 권한 · 병원 업종 · 1시간 한도 · 글자 수.
 */
export function useMemberPostForm(
  tenantSlug: string,
  board: PublicBoard,
  postId: string | undefined,
  memberEnabled: boolean,
  onSaved: (id: string) => void
) {
  const login = useMemberReady(tenantSlug, memberEnabled)
  const [loaded, setLoaded] = useState<'loading' | 'ready' | 'missing' | 'denied'>(
    postId ? 'loading' : 'ready'
  )
  const [values, setValues] = useState<MemberPostValues>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<'title' | 'content', string>>>({})
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [wasSecret, setWasSecret] = useState(false)
  // 비밀글 체크 — 허용한 게시판이거나 이미 비밀글이면 (T-151-A). 서버가 다시 확인한다
  const secretChoice = Boolean(board.allow_secret) || wasSecret

  useEffect(() => {
    if (login !== 'member' || !postId) return
    let cancelled = false
    fetchMyPost(tenantSlug, board.slug, postId)
      .then((post) => {
        if (cancelled) return
        if (!post) {
          setLoaded('missing')
          return
        }
        setValues({
          title: post.title,
          content: post.content,
          categoryId: post.category_id ?? '',
          isSecret: Boolean(post.is_secret),
        })
        setWasSecret(Boolean(post.is_secret))
        setLoaded('ready')
      })
      .catch((error) => {
        if (!cancelled) setLoaded(error instanceof MemberBoardDenied ? 'denied' : 'missing')
      })
    return () => {
      cancelled = true
    }
  }, [login, tenantSlug, board.slug, postId])

  const state: MemberFormState =
    login === 'member'
      ? loaded === 'ready'
        ? 'ready'
        : loaded === 'loading'
          ? 'checking'
          : loaded === 'denied'
            ? 'login'
            : 'missing'
      : login

  const change = (next: Partial<MemberPostValues>) => {
    setValues((current) => ({ ...current, ...next }))
    setErrors((current) => ({
      ...current,
      ...Object.fromEntries(Object.keys(next).map((key) => [key, undefined])),
    }))
  }

  const submit = async () => {
    const title = values.title.trim()
    const content = values.content.trim()
    const nextErrors = {
      ...(title ? {} : { title: '제목을 입력해 주세요.' }),
      ...(content ? {} : { content: '내용을 입력해 주세요.' }),
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      setMessage('입력한 내용을 확인해 주세요.')
      return
    }
    setSubmitting(true)
    setMessage('')
    const input = {
      title,
      content,
      category_id: values.categoryId || null,
      ...(secretChoice ? { is_secret: values.isSecret } : {}),
    }
    try {
      const saved = postId
        ? await updateMemberPost(tenantSlug, board.slug, postId, input)
        : await createMemberPost(tenantSlug, board.slug, input)
      onSaved(saved.id)
    } catch (error) {
      if (error instanceof MemberBoardDenied) setLoaded('denied')
      setMessage(
        error instanceof MemberPostError
          ? error.message
          : '저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  return { state, values, errors, message, submitting, secretChoice, change, submit }
}

/** 글 상세의 [수정] [삭제] — 로그인한 회원이 쓴 글일 때만 (서버가 확인한다) */
export function useMyPost(
  tenantSlug: string,
  board: PublicBoard,
  postId: string,
  onDeleted: () => void
) {
  const isMember = useIsMember(tenantSlug)
  const [mine, setMine] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    // 회원 글쓰기 게시판에서만 묻는다 — 다른 게시판은 회원 글이 없어 요청을 아낀다
    if (!isMember || board.write_access !== 'MEMBER') {
      setMine(false)
      return
    }
    let cancelled = false
    fetchMyPost(tenantSlug, board.slug, postId)
      .then((post) => !cancelled && setMine(Boolean(post)))
      .catch(() => !cancelled && setMine(false))
    return () => {
      cancelled = true
    }
  }, [isMember, tenantSlug, board.slug, board.write_access, postId])

  const remove = async () => {
    if (!window.confirm('이 글을 삭제할까요? 삭제하면 홈페이지에서 보이지 않습니다.')) return
    setDeleting(true)
    try {
      await deleteMemberPost(tenantSlug, board.slug, postId)
      onDeleted()
    } catch (error) {
      window.alert(
        error instanceof MemberPostError
          ? error.message
          : '삭제하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'
      )
      setDeleting(false)
    }
  }

  return { mine, deleting, remove }
}
