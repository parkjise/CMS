import { useEffect, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router'
import type {
  BoardCategory,
  BoardField,
  BodyNode,
  Post,
  PostAttachment,
  PostStatus,
  PostVersionDetail,
} from '@cms/types'
import { Button, Input, Toggle, toast } from '@cms/ui'
import { RichTextEditor } from '@/components/boards/RichTextEditor'
import { CustomFieldInputs } from '@/components/boards/CustomFieldInputs'
import { PostMoveDialog } from '@/components/boards/PostMoveDialog'
import { PostAttachmentsField } from '@/components/boards/PostAttachmentsField'
import { PostVersionsPanel } from '@/components/boards/PostVersionsPanel'
import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import { BoardPageTitle } from '@/components/boards/BoardPageTitle'
import { useCanEdit } from '@/hooks/useCanEdit'
import { useBoardCategories } from '@/hooks/useBoardCategories'
import { useBoardFields } from '@/hooks/useBoardFields'
import { useBoards, useCreatePost, usePost, useUpdatePost } from '@/hooks/useBoards'
import {
  type CustomValues,
  customFieldOfError,
  initialCustomValues,
  toCustomData,
  validateCustomValues,
} from '@/lib/customFields'
import { pickErrorMessage } from '@/lib/errorMessages'
import { categoryLabel, orderTree } from '@/lib/categoryTree'
import { isScheduled } from '@/lib/postStatus'
import { type PostDraft, clearDraft, draftKey, readDraft, writeDraft } from '@/lib/postDraft'

const TITLE_MAX = 200
const LOCAL_MINUTE = 'YYYY-MM-DDTHH:mm'
const SCHEDULE_MAX_DAYS = 365
// 입력을 멈추고 이만큼 지나면 브라우저에 보관한다 (T-190)
const AUTOSAVE_DELAY_MS = 2000

interface PostFormProps {
  boardId: string
  post?: Post
  /** 칸 정의 — 불러오지 못했으면 null, 칸 값을 보내지 않아 있던 값이 그대로 남는다 */
  fields: BoardField[] | null
  /** 분류 — 불러오지 못했으면 null, 분류를 보내지 않아 그대로 남는다 */
  categories: BoardCategory[] | null
}

function PostForm({ boardId, post, fields, categories }: PostFormProps) {
  const navigate = useNavigate()
  const canEdit = useCanEdit()
  const createPost = useCreatePost(boardId)
  const updatePost = useUpdatePost(boardId)
  const [title, setTitle] = useState(post?.title ?? '')
  const [isPinned, setIsPinned] = useState(post?.is_pinned ?? false)
  const [categoryId, setCategoryId] = useState(post?.category_id ?? '')
  const [isSecret, setIsSecret] = useState(post?.is_secret ?? false)
  const board = useBoards().data?.find((b) => b.id === boardId)
  // 비밀글을 허용한 게시판이거나 이미 비밀글일 때만 (T-151-A)
  const secretChoice = Boolean(board?.operation?.allow_secret || post?.is_secret)
  const [body, setBody] = useState<BodyNode[]>(post?.body ?? [])
  const [titleError, setTitleError] = useState<string>()
  const [moving, setMoving] = useState(false)
  // 첨부 파일 (T-194) — 공개 첨부라 비밀글 · 회원만 읽는 게시판에는 붙이지 않는다
  const [attachments, setAttachments] = useState<PostAttachment[]>(post?.attachments ?? [])
  const attachmentsBlocked =
    isSecret || board?.permissions?.read === 'MEMBER'
      ? '비밀글과 회원만 읽는 게시판에는 아직 파일을 붙일 수 없어요. 첨부 파일은 주소를 아는 누구나 받을 수 있기 때문이에요.'
      : undefined
  const attachmentIds = attachments.map((file) => file.id)
  const attachmentsChanged =
    attachmentIds.join() !== (post?.attachments ?? []).map((file) => file.id).join()
  // 예약 공개 (T-189) — 아직 홈페이지에 나온 적 없는 글이나 예약 글만 고른다
  const scheduledBefore = Boolean(post && isScheduled(post))
  const scheduleChoice = !post?.published_at || scheduledBefore
  const [scheduleLater, setScheduleLater] = useState(scheduledBefore)
  const [scheduledAt, setScheduledAt] = useState(
    scheduledBefore ? dayjs(post?.published_at).format(LOCAL_MINUTE) : ''
  )
  const [scheduleError, setScheduleError] = useState<string>()
  const custom = useForm<CustomValues>({
    defaultValues: initialCustomValues(fields ?? [], post ? post.custom_data : null),
  })

  // 자동 보관 (T-190) — 저장하지 않은 내용을 이 브라우저에만 남긴다
  const storageKey = draftKey(boardId, post?.id)
  const [pendingDraft, setPendingDraft] = useState<PostDraft | null>(() => {
    const draft = readDraft(storageKey)
    // 보관한 뒤 다른 곳에서 저장했으면 보관본이 더 낡았다
    if (draft && post && dayjs(draft.saved_at).isBefore(post.updated_at)) {
      clearDraft(storageKey)
      return null
    }
    return draft
  })
  const [editorInitial, setEditorInitial] = useState<BodyNode[]>(post?.body ?? [])
  const [editorKey, setEditorKey] = useState(0)
  const [bodyReady, setBodyReady] = useState(false)
  const [customTick, setCustomTick] = useState(0)
  const [autosavedAt, setAutosavedAt] = useState<string>()
  // 편집기가 처음 알린 내용 기준 — 손대지 않은 글은 보관하지 않는다
  const baseline = useRef<string | null>(null)

  useEffect(() => {
    const subscription = custom.watch(() => setCustomTick((tick) => tick + 1))
    return () => subscription.unsubscribe()
  }, [custom])

  useEffect(() => {
    if (!canEdit || !bodyReady || pendingDraft) return undefined
    const draft = {
      title,
      body,
      is_pinned: isPinned,
      is_secret: isSecret,
      category_id: categoryId,
      custom: custom.getValues(),
    }
    const current = JSON.stringify(draft)
    if (baseline.current === null) {
      baseline.current = current
      return undefined
    }
    if (current === baseline.current) return undefined
    const timer = setTimeout(() => {
      const savedAt = new Date().toISOString()
      if (writeDraft(storageKey, { ...draft, saved_at: savedAt })) setAutosavedAt(savedAt)
    }, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [
    canEdit,
    bodyReady,
    pendingDraft,
    title,
    body,
    isPinned,
    isSecret,
    categoryId,
    customTick,
    custom,
    storageKey,
  ])

  const changeBody = (next: BodyNode[]) => {
    setBody(next)
    setBodyReady(true)
  }

  /** 보관본 · 이전 버전으로 편집 칸을 채운다 — 저장은 관리자가 */
  const fillForm = (content: Omit<PostDraft, 'saved_at'>) => {
    setTitle(content.title)
    setIsPinned(content.is_pinned)
    setIsSecret(content.is_secret)
    setCategoryId(content.category_id)
    custom.reset({ ...custom.getValues(), ...content.custom })
    setBody(content.body)
    setEditorInitial(content.body)
    setEditorKey((key) => key + 1)
  }

  const restoreDraft = () => {
    if (!pendingDraft) return
    fillForm(pendingDraft)
    setPendingDraft(null)
  }

  // 이전 버전 (T-191)
  const restoreVersion = (version: PostVersionDetail) => {
    fillForm({
      title: version.title,
      body: version.body,
      is_pinned: version.is_pinned,
      is_secret: version.is_secret,
      category_id: version.category_id ?? '',
      custom: initialCustomValues(fields ?? [], version.custom_data),
    })
    toast.info('이전 버전 내용을 편집 칸에 불러왔어요. 저장해야 글이 바뀌어요.')
    window.scrollTo?.({ top: 0, behavior: 'smooth' })
  }

  const discardDraft = () => {
    clearDraft(storageKey)
    setPendingDraft(null)
  }

  const saving = createPost.isPending || updatePost.isPending
  const status: PostStatus = post?.status ?? 'DRAFT'

  const save = async (next: PostStatus) => {
    if (!title.trim()) {
      setTitleError('제목을 입력해주세요.')
      return
    }
    setTitleError(undefined)
    const scheduling = scheduleChoice && scheduleLater && next === 'PUBLISHED'
    if (scheduling && !scheduledAt) {
      setScheduleError('공개할 날짜와 시각을 골라 주세요.')
      return
    }
    if (scheduling && !dayjs(scheduledAt).isAfter(dayjs())) {
      setScheduleError('예약 시각은 지금보다 뒤여야 합니다.')
      return
    }
    setScheduleError(undefined)
    custom.clearErrors()
    const stored = post?.custom_data ?? {}
    const values = custom.getValues()
    const fieldErrors = validateCustomValues(fields ?? [], values, {
      publishing: next === 'PUBLISHED',
      first: !post?.published_at,
      stored,
    })
    const invalid = Object.entries(fieldErrors)
    if (invalid.length > 0) {
      invalid.forEach(([key, message]) => custom.setError(key, { message }))
      toast.error('입력한 값을 확인해주세요.')
      return
    }
    const payload = {
      title: title.trim(),
      body,
      is_pinned: isPinned,
      ...(secretChoice ? { is_secret: isSecret } : {}),
      status: next,
      ...(fields?.length ? { custom_data: toCustomData(fields, values) } : {}),
      ...(categories ? { category_id: categoryId || null } : {}),
      ...(attachmentsChanged ? { attachment_ids: attachmentIds } : {}),
      ...(scheduling ? { published_at: dayjs(scheduledAt).toISOString() } : {}),
      // 예약을 풀고 바로 공개
      ...(scheduledBefore && next === 'PUBLISHED' && !scheduling ? { published_at: null } : {}),
    }
    try {
      const saved = post
        ? await updatePost.mutateAsync({ id: post.id, payload })
        : await createPost.mutateAsync(payload)
      clearDraft(storageKey)
      if (scheduling) {
        toast.success(
          `예약했습니다. ${dayjs(scheduledAt).format('M월 D일 HH:mm')}에 홈페이지에 공개돼요.`
        )
      } else {
        toast.success(next === 'PUBLISHED' ? '홈페이지에 공개했습니다.' : '저장했습니다.')
      }
      // 공개했으면 글 목록에서 "홈페이지에서 보기"를 보여 준다
      navigate(`/admin/boards/${boardId}/posts`, {
        state: next === 'PUBLISHED' && !scheduling ? { publishedId: saved.id } : undefined,
      })
    } catch (error) {
      const message = pickErrorMessage(error, '저장하지 못했습니다.')
      const fieldKey = customFieldOfError(error)
      if (fieldKey) custom.setError(fieldKey, { message })
      toast.error(message)
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        save(status)
      }}
    >
      {canEdit && pendingDraft && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"
        >
          <p className="mr-auto">
            저장하지 않은 내용이 있어요 ({dayjs(pendingDraft.saved_at).format('MM/DD HH:mm')} 자동
            보관). 이어서 쓸까요?
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={discardDraft}>
            버리기
          </Button>
          <Button type="button" size="sm" onClick={restoreDraft}>
            이어서 쓰기
          </Button>
        </div>
      )}
      <ReadOnlyFieldset>
        <div className="space-y-5">
          <Input
            label="제목"
            required
            maxLength={TITLE_MAX}
            value={title}
            error={titleError}
            onChange={(e) => setTitle(e.target.value)}
          />
          {categories && categories.length > 0 && (
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-slate-700">카테고리</span>
              <select
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm sm:w-64"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">분류 없음</option>
                {orderTree(categories).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.is_active
                      ? categoryLabel(c, categories)
                      : `${categoryLabel(c, categories)} (숨김)`}
                  </option>
                ))}
              </select>
            </label>
          )}
          {/* 홈페이지와 같은 순서 — 제목, 추가 칸, 내용 */}
          {fields && fields.length > 0 && (
            <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
              <CustomFieldInputs
                fields={fields}
                control={custom.control}
                errors={custom.formState.errors}
                clearError={custom.clearErrors}
              />
            </div>
          )}
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">내용</p>
            <RichTextEditor
              key={editorKey}
              initial={editorInitial}
              editable={canEdit}
              onChange={changeBody}
            />
          </div>
          <Toggle
            label="상단 고정"
            checked={isPinned}
            onChange={(e) => setIsPinned(e.target.checked)}
          />
          {secretChoice && (
            <Toggle
              label="비밀글"
              description="홈페이지 목록에는 제목만 보이고, 내용은 쓴 회원과 관리자만 봅니다."
              checked={isSecret}
              onChange={(e) => setIsSecret(e.target.checked)}
            />
          )}
          <PostAttachmentsField
            boardId={boardId}
            value={attachments}
            onChange={setAttachments}
            blockedReason={attachmentsBlocked}
          />
          {scheduleChoice && (
            <fieldset className="rounded-lg border border-slate-200 bg-white p-4">
              <legend className="px-1 text-sm font-medium text-slate-700">공개 시각</legend>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-700">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="publish-when"
                    checked={!scheduleLater}
                    onChange={() => {
                      setScheduleLater(false)
                      setScheduleError(undefined)
                    }}
                  />
                  지금 바로
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="publish-when"
                    checked={scheduleLater}
                    onChange={() => setScheduleLater(true)}
                  />
                  예약
                </label>
              </div>
              {scheduleLater && (
                <div className="mt-3">
                  <label className="block text-sm">
                    <span className="mb-1.5 block text-slate-600">공개할 날짜와 시각</span>
                    <input
                      type="datetime-local"
                      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm sm:w-64"
                      value={scheduledAt}
                      min={dayjs().format(LOCAL_MINUTE)}
                      max={dayjs().add(SCHEDULE_MAX_DAYS, 'day').format(LOCAL_MINUTE)}
                      aria-invalid={scheduleError ? true : undefined}
                      onChange={(e) => {
                        setScheduledAt(e.target.value)
                        setScheduleError(undefined)
                      }}
                    />
                  </label>
                  {scheduleError ? (
                    <p className="mt-1.5 text-xs text-red-600" role="alert">
                      {scheduleError}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-xs text-slate-500">
                      [예약 공개]를 누르면 정한 시각에 홈페이지에 나타나요. 그 전에는 관리자만 볼 수
                      있어요.
                    </p>
                  )}
                </div>
              )}
            </fieldset>
          )}
        </div>
      </ReadOnlyFieldset>

      {post && (
        <PostVersionsPanel
          boardId={boardId}
          postId={post.id}
          onRestore={canEdit ? restoreVersion : undefined}
        />
      )}

      {canEdit && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          {post && (
            <Button
              type="button"
              variant="ghost"
              className="mr-auto"
              disabled={saving}
              onClick={() => setMoving(true)}
            >
              게시판 옮기기
            </Button>
          )}
          {autosavedAt && (
            <span className="self-center text-xs text-slate-400" role="status">
              자동 보관됨 {dayjs(autosavedAt).format('HH:mm')}
            </span>
          )}
          <Link
            to={`/admin/boards/${boardId}/posts`}
            className="inline-flex h-10 items-center rounded-md px-4 text-sm text-slate-600 hover:bg-slate-100"
          >
            취소
          </Link>
          {status === 'PUBLISHED' ? (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => save('PRIVATE')}
              >
                비공개로 저장
              </Button>
              <Button type="button" loading={saving} onClick={() => save('PUBLISHED')}>
                {scheduleChoice && scheduleLater ? '예약 공개' : '저장'}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => save(status)}
              >
                {status === 'PRIVATE' ? '비공개로 저장' : '임시저장'}
              </Button>
              <Button type="button" loading={saving} onClick={() => save('PUBLISHED')}>
                {scheduleChoice && scheduleLater ? '예약 공개' : '공개하기'}
              </Button>
            </>
          )}
        </div>
      )}
      {moving && post && (
        <PostMoveDialog
          postIds={[post.id]}
          fromBoardId={boardId}
          note="저장하지 않은 수정 내용은 옮기면서 사라집니다. 먼저 저장해 주세요."
          onClose={() => setMoving(false)}
          onMoved={(_result, targetId) =>
            navigate(`/admin/boards/${targetId}/posts/${post.id}/edit`, { replace: true })
          }
        />
      )}
    </form>
  )
}

/** 글 작성 · 수정 (BM-06) */
export function BoardPostEditPage() {
  const { boardId = '', postId } = useParams()
  const postQuery = usePost(boardId, postId)
  const fieldsQuery = useBoardFields(boardId)
  const categoriesQuery = useBoardCategories(boardId)

  return (
    <div className="space-y-6 p-6 md:p-8">
      <BoardPageTitle
        title={postId ? '글 수정' : '글쓰기'}
        description="제목, 공개 상태와 본문을 편집합니다. 저장하면 홈페이지에 바로 반영돼요."
        actions={
          <Link
            to={`/admin/boards/${boardId}/posts`}
            className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ← 글 목록
          </Link>
        }
      />

      {postId && postQuery.isLoading && (
        <div className="h-40 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
      )}
      {postId && postQuery.isError && (
        <p className="text-sm text-red-600">글을 불러오지 못했습니다.</p>
      )}
      {fieldsQuery.isError && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          추가 칸을 불러오지 못했습니다. 제목과 내용만 저장되고, 추가 칸의 값은 그대로 남습니다.
        </p>
      )}
      {categoriesQuery.isError && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          카테고리를 불러오지 못했습니다. 저장해도 글의 카테고리는 그대로 남습니다.
        </p>
      )}
      {(!postId || postQuery.data) && !fieldsQuery.isLoading && !categoriesQuery.isLoading && (
        <PostForm
          key={postId ?? 'new'}
          boardId={boardId}
          post={postQuery.data}
          fields={fieldsQuery.data ?? null}
          categories={categoriesQuery.data ?? null}
        />
      )}
    </div>
  )
}
