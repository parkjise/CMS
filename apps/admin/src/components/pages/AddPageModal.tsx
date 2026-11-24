import { useEffect, useState } from 'react'
import { Button, Input, Modal, toast } from '@cms/ui'
import { type Page, useCreatePage, useDuplicatePage } from '@/hooks/usePages'
import { pickErrorMessage } from '@/lib/errorMessages'
import { pageKeyError, parentOptions } from '@/lib/pageKey'
import { usePageKeyProblem } from '@/hooks/usePageKeyProblem'
import { PageKeyField } from './PageKeyField'

interface AddPageModalProps {
  open: boolean
  pages: Page[]
  /** 처음부터 복제로 열 때 — 목록의 [복제] */
  copyFrom?: Page | null
  onClose: () => void
  onCreated: (page: Page) => void
}

type Start = 'blank' | 'copy'

/** 서버 오류가 어느 칸 것인지 — field 가 page_key 면 주소 칸에 */
const fieldOf = (err: unknown): string | undefined =>
  (err as { response?: { data?: { error?: { field?: string } } } })?.response?.data?.error?.field

/** 페이지 추가 (PM-02) — 빈 페이지 또는 기존 페이지 복제. 자세한 설정은 만든 뒤 설정 탭에서 */
export function AddPageModal({ open, pages, copyFrom, onClose, onCreated }: AddPageModalProps) {
  const create = useCreatePage()
  const duplicate = useDuplicatePage()
  const [title, setTitle] = useState('')
  const [key, setKey] = useState('')
  const [parent, setParent] = useState('')
  const [start, setStart] = useState<Start>('blank')
  const [sourceId, setSourceId] = useState('')
  const [errors, setErrors] = useState<{ title?: string; key?: string }>({})
  const keyProblem = usePageKeyProblem(key)

  useEffect(() => {
    if (!open) return
    setTitle(copyFrom ? `${copyFrom.title} 복사`.slice(0, 30) : '')
    setKey('')
    setParent('')
    setStart(copyFrom ? 'copy' : 'blank')
    setSourceId(copyFrom?.id ?? pages[0]?.id ?? '')
    setErrors({})
  }, [open, copyFrom, pages])

  const pending = create.isPending || duplicate.isPending

  const submit = () => {
    const found = {
      title: title.trim() ? undefined : '페이지 이름을 입력해 주세요.',
      key: key ? (pageKeyError(key) ?? keyProblem) : '주소를 입력해 주세요.',
    }
    setErrors(found)
    if (found.title || found.key) return
    const done = {
      onSuccess: (page: Page) => {
        toast.success(`'${page.title}' 페이지를 만들었어요.`)
        onCreated(page)
      },
      onError: (err: unknown) => {
        const message = pickErrorMessage(err, '페이지를 만들지 못했어요.')
        if (fieldOf(err) === 'page_key') setErrors({ key: message })
        else toast.error(message)
      },
    }
    if (start === 'copy') {
      duplicate.mutate({ id: sourceId, title: title.trim(), page_key: key }, done)
    } else {
      create.mutate(
        // 숨김으로 만들어 내용을 채운 뒤 공개로 바꾼다 (기획서 PART C 4번 #5)
        { title: title.trim(), page_key: key, parent_key: parent || undefined, is_public: false },
        done
      )
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="새 페이지 추가" size="md">
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Input
          label="페이지 이름"
          required
          value={title}
          maxLength={30}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          placeholder="예: 의료진 소개"
        />
        <PageKeyField
          id="new-page-key"
          value={key}
          onChange={(value) => {
            setKey(value)
            setErrors((e) => ({ ...e, key: undefined }))
          }}
          error={errors.key}
          helperText="영문 소문자 · 숫자 · 하이픈. 예: doctors"
        />

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-slate-700">시작 방식</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['blank', '빈 페이지'],
                ['copy', '기존 페이지 복제'],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"
              >
                <input
                  type="radio"
                  name="page-start"
                  value={value}
                  checked={start === value}
                  onChange={() => setStart(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {start === 'copy' ? (
          <div className="space-y-1.5">
            <label htmlFor="page-copy-source" className="text-sm font-medium text-slate-700">
              복제할 페이지
            </label>
            <select
              id="page-copy-source"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              섹션과 내용을 복사해 숨김 상태로 만들어요. 갤러리 사진은 복사하지 않아요.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label htmlFor="page-parent" className="text-sm font-medium text-slate-700">
              상위 페이지 (메뉴 묶음)
            </label>
            <select
              id="page-parent"
              value={parent}
              onChange={(e) => setParent(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">없음 (맨 위)</option>
              {parentOptions(pages).map((p) => (
                <option key={p.id} value={p.page_key}>
                  {p.title}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              숨김 상태로 만들어져요. 섹션을 채운 뒤 설정에서 공개로 바꿔 주세요.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" loading={pending} disabled={pending}>
            만들기
          </Button>
        </div>
      </form>
    </Modal>
  )
}
