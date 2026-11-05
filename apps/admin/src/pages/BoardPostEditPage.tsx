import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { Post, PostStatus } from '@cms/types'
import { Button, Input, Toggle, toast } from '@cms/ui'
import {
  BodyBlockEditor,
  type DraftBlock,
  fromDraft,
  toDraft,
} from '@/components/boards/BodyBlockEditor'
import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import { useCanEdit } from '@/hooks/useCanEdit'
import { useCreatePost, usePost, useUpdatePost } from '@/hooks/useBoards'
import { pickErrorMessage } from '@/lib/errorMessages'

const TITLE_MAX = 200

interface PostFormProps {
  boardId: string
  post?: Post
}

function PostForm({ boardId, post }: PostFormProps) {
  const navigate = useNavigate()
  const canEdit = useCanEdit()
  const createPost = useCreatePost(boardId)
  const updatePost = useUpdatePost(boardId)
  const [title, setTitle] = useState(post?.title ?? '')
  const [isPinned, setIsPinned] = useState(post?.is_pinned ?? false)
  const [blocks, setBlocks] = useState<DraftBlock[]>(() => toDraft(post?.body ?? []))
  const [titleError, setTitleError] = useState<string>()

  const saving = createPost.isPending || updatePost.isPending
  const status: PostStatus = post?.status ?? 'DRAFT'

  const save = async (next: PostStatus) => {
    if (!title.trim()) {
      setTitleError('제목을 입력해주세요.')
      return
    }
    setTitleError(undefined)
    const payload = {
      title: title.trim(),
      body: fromDraft(blocks),
      is_pinned: isPinned,
      status: next,
    }
    try {
      if (post) await updatePost.mutateAsync({ id: post.id, payload })
      else await createPost.mutateAsync(payload)
      toast.success(next === 'PUBLISHED' ? '홈페이지에 공개했습니다.' : '저장했습니다.')
      navigate(`/admin/boards/${boardId}/posts`)
    } catch (error) {
      toast.error(pickErrorMessage(error, '저장하지 못했습니다.'))
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
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">내용</p>
            <BodyBlockEditor value={blocks} onChange={setBlocks} />
          </div>
          <Toggle
            label="상단 고정"
            checked={isPinned}
            onChange={(e) => setIsPinned(e.target.checked)}
          />
        </div>
      </ReadOnlyFieldset>

      {canEdit && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <Link
            to={`/admin/boards/${boardId}/posts`}
            className="inline-flex h-10 items-center rounded-md px-4 text-sm text-slate-600 hover:bg-slate-100"
          >
            취소
          </Link>
          {status === 'PUBLISHED' ? (
            <>
              <Button type="button" variant="secondary" disabled={saving} onClick={() => save('PRIVATE')}>
                비공개로 저장
              </Button>
              <Button type="button" loading={saving} onClick={() => save('PUBLISHED')}>
                저장
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="secondary" disabled={saving} onClick={() => save(status)}>
                {status === 'PRIVATE' ? '비공개로 저장' : '임시저장'}
              </Button>
              <Button type="button" loading={saving} onClick={() => save('PUBLISHED')}>
                공개하기
              </Button>
            </>
          )}
        </div>
      )}
    </form>
  )
}

/** 글 작성 · 수정 (BM-06) */
export function BoardPostEditPage() {
  const { boardId = '', postId } = useParams()
  const postQuery = usePost(boardId, postId)

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6 md:p-8">
      <div>
        <Link to={`/admin/boards/${boardId}/posts`} className="text-sm text-slate-500 hover:text-slate-700">
          ← 글 목록
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{postId ? '글 수정' : '글쓰기'}</h1>
      </div>

      {postId && postQuery.isLoading && (
        <div className="h-40 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
      )}
      {postId && postQuery.isError && (
        <p className="text-sm text-red-600">글을 불러오지 못했습니다.</p>
      )}
      {(!postId || postQuery.data) && (
        <PostForm key={postId ?? 'new'} boardId={boardId} post={postQuery.data} />
      )}
    </div>
  )
}
