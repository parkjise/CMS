'use client'

import { useEffect, useState } from 'react'
import type { GuestPost, MemberPost, PublicBoard } from '@cms/types'
import {
  GuestPasswordError,
  createGuestPost,
  deleteGuestPost,
  updateGuestPost,
  verifyGuestPost,
} from '@/lib/guestBoard'
import {
  MemberBoardDenied,
  MemberPostError,
  createMemberPost,
  deleteMemberPost,
  fetchMyPost,
  updateMemberPost,
} from '@/lib/memberBoard'
import { useIsMember, useMemberStore } from '@/lib/memberStore'
import { executeRecaptcha } from '@/lib/recaptcha'

export const TITLE_MAX = 200
export const CONTENT_MAX = 5000
export const GUEST_NAME_MAX = 20
export const GUEST_PASSWORD_MIN = 4
export const GUEST_PASSWORD_MAX = 50

/**
 * - checking: 로그인 · 글을 확인하는 중
 * - login · closed: 쓸 수 없다 (로그인 안내 · 회원 기능 꺼짐)
 * - password: 비회원 글 고치기 — 글 비밀번호를 먼저 받는다 (T-151-B)
 * - ready: 폼 · missing: 고칠 수 있는 글이 아니다
 */
export type MemberFormState = 'checking' | 'login' | 'closed' | 'password' | 'ready' | 'missing'

export interface MemberPostValues {
  title: string
  content: string
  categoryId: string
  isSecret: boolean
  /** 비회원 글쓰기 (T-151-B) */
  name: string
  password: string
  agree: boolean
}

type FieldErrors = Partial<Record<'title' | 'content' | 'name' | 'password' | 'agree', string>>

const EMPTY: MemberPostValues = {
  title: '',
  content: '',
  categoryId: '',
  isSecret: false,
  name: '',
  password: '',
  agree: false,
}

const SAVE_FAILED = '저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'

/** 로그인 상태 — 회원 기능이 꺼졌으면 closed */
function useMemberReady(tenantSlug: string, memberEnabled: boolean): 'checking' | 'login' | 'closed' | 'member' {
  const isMember = useIsMember(tenantSlug)
  const ready = useMemberStore((s) => s.slug === tenantSlug && s.status === 'ready')
  if (!memberEnabled) return 'closed'
  if (!ready) return 'checking'
  return isMember ? 'member' : 'login'
}

const valuesOf = (post: MemberPost): Partial<MemberPostValues> => ({
  title: post.title,
  content: post.content,
  categoryId: post.category_id ?? '',
  isSecret: Boolean(post.is_secret),
})

/**
 * 홈페이지 글쓰기 · 고치기 폼 — 로그인한 회원 (T-150-B), 비회원 글쓰기를 허용했으면
 * 로그인하지 않은 방문자도 이름 · 글 비밀번호로 (T-151-B). 서버가 다시 검사한다.
 */
export function useMemberPostForm(
  tenantSlug: string,
  board: PublicBoard,
  postId: string | undefined,
  memberEnabled: boolean,
  onSaved: (id: string) => void,
) {
  const login = useMemberReady(tenantSlug, memberEnabled)
  const guestAllowed = Boolean(board.allow_guest)
  const [loaded, setLoaded] = useState<'loading' | 'ready' | 'missing' | 'denied' | 'guest'>(
    postId ? 'loading' : 'ready',
  )
  const [guestUnlocked, setGuestUnlocked] = useState(false)
  const [values, setValues] = useState<MemberPostValues>(EMPTY)
  const [errors, setErrors] = useState<FieldErrors>({})
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
          // 로그인하지 않고 쓴 비회원 글일 수 있다 — 글 비밀번호로 고친다
          setLoaded(guestAllowed ? 'guest' : 'missing')
          return
        }
        setValues((current) => ({ ...current, ...valuesOf(post) }))
        setWasSecret(Boolean(post.is_secret))
        setLoaded('ready')
      })
      .catch((error) => {
        if (!cancelled) setLoaded(error instanceof MemberBoardDenied ? 'denied' : 'missing')
      })
    return () => {
      cancelled = true
    }
  }, [login, tenantSlug, board.slug, postId, guestAllowed])

  // 비회원으로 쓰는가 — 회원이면 회원으로 쓴다. 남의 글이면 비밀번호로
  const guest = (login !== 'member' && guestAllowed && login !== 'checking') || loaded === 'guest'
  const memberState: MemberFormState =
    loaded === 'ready' ? 'ready' : loaded === 'loading' ? 'checking' : loaded === 'denied' ? 'login' : 'missing'
  const state: MemberFormState = guest
    ? postId && !guestUnlocked
      ? 'password'
      : 'ready'
    : login === 'member'
      ? memberState
      : login

  const change = (next: Partial<MemberPostValues>) => {
    setValues((current) => ({ ...current, ...next }))
    setErrors((current) => ({
      ...current,
      ...Object.fromEntries(Object.keys(next).map((key) => [key, undefined])),
    }))
  }

  /** 비회원 글 고치기 — 글 비밀번호가 맞으면 폼을 채운다 */
  const unlock = async () => {
    if (!postId) return
    if (values.password.length < GUEST_PASSWORD_MIN) {
      setErrors({ password: `비밀번호를 ${GUEST_PASSWORD_MIN}자 이상 입력해 주세요.` })
      return
    }
    setSubmitting(true)
    setMessage('')
    try {
      const post: GuestPost = await verifyGuestPost(tenantSlug, board.slug, postId, values.password)
      setValues((current) => ({ ...current, ...valuesOf(post), name: post.guest_name }))
      setWasSecret(Boolean(post.is_secret))
      setGuestUnlocked(true)
    } catch (error) {
      if (error instanceof GuestPasswordError) setErrors({ password: error.message })
      else setMessage(error instanceof MemberPostError ? error.message : SAVE_FAILED)
    } finally {
      setSubmitting(false)
    }
  }

  const validate = (): FieldErrors => ({
    ...(values.title.trim() ? {} : { title: '제목을 입력해 주세요.' }),
    ...(values.content.trim() ? {} : { content: '내용을 입력해 주세요.' }),
    ...(guest && !postId && !values.name.trim() ? { name: '이름을 입력해 주세요.' } : {}),
    ...(guest && !postId && values.password.length < GUEST_PASSWORD_MIN
      ? { password: `비밀번호를 ${GUEST_PASSWORD_MIN}자 이상 입력해 주세요.` }
      : {}),
    ...(guest && !postId && !values.agree ? { agree: '개인정보 수집 · 이용에 동의해 주세요.' } : {}),
  })

  const submit = async () => {
    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      setMessage('입력한 내용을 확인해 주세요.')
      return
    }
    setSubmitting(true)
    setMessage('')
    const input = {
      title: values.title.trim(),
      content: values.content.trim(),
      category_id: values.categoryId || null,
      ...(secretChoice ? { is_secret: values.isSecret } : {}),
    }
    try {
      let saved: { id: string }
      if (guest && postId) {
        saved = await updateGuestPost(tenantSlug, board.slug, postId, { ...input, password: values.password })
      } else if (guest) {
        const recaptchaToken = await executeRecaptcha(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY, 'board_guest_write')
        saved = await createGuestPost(tenantSlug, board.slug, {
          ...input,
          name: values.name.trim(),
          password: values.password,
          agree: true,
          recaptcha_token: recaptchaToken,
        })
      } else {
        saved = postId
          ? await updateMemberPost(tenantSlug, board.slug, postId, input)
          : await createMemberPost(tenantSlug, board.slug, input)
      }
      onSaved(saved.id)
    } catch (error) {
      if (error instanceof MemberBoardDenied) setLoaded('denied')
      setMessage(error instanceof MemberPostError || error instanceof GuestPasswordError ? error.message : SAVE_FAILED)
    } finally {
      setSubmitting(false)
    }
  }

  return { state, guest, values, errors, message, submitting, secretChoice, change, submit, unlock }
}

/** 글 상세의 [수정] [삭제] — 로그인한 회원이 쓴 글일 때만 (서버가 확인한다) */
export function useMyPost(tenantSlug: string, board: PublicBoard, postId: string, onDeleted: () => void) {
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
      window.alert(error instanceof MemberPostError ? error.message : '삭제하지 못했습니다. 잠시 뒤 다시 시도해 주세요.')
      setDeleting(false)
    }
  }

  return { mine, deleting, remove }
}

/** 비회원 글의 [삭제] · 비밀글 열기 — 글 비밀번호를 받는다 (T-151-B) */
export function useGuestPassword(tenantSlug: string, board: PublicBoard, postId: string) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async <T,>(action: (password: string) => Promise<T>): Promise<T | null> => {
    if (password.length < GUEST_PASSWORD_MIN) {
      setError(`비밀번호를 ${GUEST_PASSWORD_MIN}자 이상 입력해 주세요.`)
      return null
    }
    setBusy(true)
    setError('')
    try {
      return await action(password)
    } catch (err) {
      setError(
        err instanceof GuestPasswordError || err instanceof MemberPostError
          ? err.message
          : '처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
      )
      return null
    } finally {
      setBusy(false)
    }
  }

  return {
    password,
    setPassword: (next: string) => {
      setPassword(next)
      setError('')
    },
    error,
    busy,
    open: () => run((pw) => verifyGuestPost(tenantSlug, board.slug, postId, pw)),
    remove: () => run((pw) => deleteGuestPost(tenantSlug, board.slug, postId, pw)),
  }
}
