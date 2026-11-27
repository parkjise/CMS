import { useState } from 'react'
import { Button, Input, Modal, toast } from '@cms/ui'
import {
  type ContentPreset,
  type ContentType,
  useCreateContentType,
} from '@/hooks/useContentTypes'
import { pickErrorMessage, pickErrorField } from '@/lib/errorMessages'

const BLANK = ''
const KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const KEY_HINT = '영문 소문자 · 숫자 · 하이픈 2~40자 — 홈페이지 연결에 쓰는 이름이에요.'

interface AddContentTypeModalProps {
  open: boolean
  presets: ContentPreset[]
  /** 이미 쓰는 키(휴지통 포함) — 시작용 유형을 다시 고르면 키를 바꾸게 한다 */
  usedKeys: string[]
  onClose: () => void
  onCreated: (type: ContentType) => void
}

/** 유형 추가 (CM-03) — 시작용 유형 5개 또는 빈 유형 */
export function AddContentTypeModal({
  open,
  presets,
  usedKeys,
  onClose,
  onCreated,
}: AddContentTypeModalProps) {
  const create = useCreateContentType()
  const [preset, setPreset] = useState<string>(presets[0]?.key ?? BLANK)
  const [name, setName] = useState('')
  const [typeKey, setTypeKey] = useState('')
  const [errors, setErrors] = useState<{ name?: string; type_key?: string }>({})

  const chosen = presets.find((p) => p.key === preset)
  const presetKeyTaken = chosen !== undefined && usedKeys.includes(chosen.key)
  // 빈 유형 · 키가 겹치는 시작용 유형은 이름 · 키를 직접 받는다
  const needsKey = chosen === undefined || presetKeyTaken

  const reset = () => {
    setPreset(presets[0]?.key ?? BLANK)
    setName('')
    setTypeKey('')
    setErrors({})
  }

  const close = () => {
    reset()
    onClose()
  }

  const submit = () => {
    const next: typeof errors = {}
    if (chosen === undefined && !name.trim()) next.name = '유형 이름을 입력해 주세요.'
    if (needsKey && !(KEY_PATTERN.test(typeKey) && typeKey.length >= 2 && typeKey.length <= 40))
      next.type_key = KEY_HINT
    setErrors(next)
    if (Object.keys(next).length > 0) return
    create.mutate(
      {
        ...(chosen ? { preset_key: chosen.key } : {}),
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(needsKey ? { type_key: typeKey } : {}),
      },
      {
        onSuccess: (type) => {
          toast.success(`'${type.name}' 유형을 만들었어요.`)
          reset()
          onCreated(type)
        },
        onError: (err) => {
          const field = pickErrorField(err)
          const message = pickErrorMessage(err, '유형을 만들지 못했어요.')
          if (field === 'type_key' || field === 'name') setErrors({ [field]: message })
          else toast.error(message)
        },
      }
    )
  }

  return (
    <Modal open={open} onClose={close} title="콘텐츠 유형 추가" size="lg">
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">시작 방식</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {[...presets, null].map((p) => {
              const key = p?.key ?? BLANK
              const selected = preset === key
              return (
                <label
                  key={key || 'blank'}
                  className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${
                    selected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="content-type-preset"
                    className="mt-1"
                    checked={selected}
                    onChange={() => {
                      setPreset(key)
                      setErrors({})
                    }}
                  />
                  <span>
                    <span className="block font-medium text-slate-900">
                      {p ? p.name : '빈 유형'}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {p ? p.description : '칸을 처음부터 직접 정해요.'}
                    </span>
                    {p && p.fields.length > 0 && (
                      <span className="mt-1 block text-xs text-slate-400">
                        더해지는 칸: {p.fields.join(' · ')}
                      </span>
                    )}
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <Input
          label={chosen ? '유형 이름 (비우면 시작용 이름)' : '유형 이름'}
          value={name}
          maxLength={40}
          placeholder={chosen?.name ?? '예: 제품 소개'}
          error={errors.name}
          onChange={(e) => setName(e.target.value)}
        />
        {needsKey && (
          <Input
            label="유형 키"
            value={typeKey}
            maxLength={40}
            placeholder="예: products"
            helperText={
              presetKeyTaken
                ? `'${chosen?.key}' 키를 이미 쓰고 있어요(휴지통 포함). 다른 키를 입력해 주세요.`
                : KEY_HINT
            }
            error={errors.type_key}
            onChange={(e) => setTypeKey(e.target.value.trim().toLowerCase())}
          />
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close}>
            취소
          </Button>
          <Button type="button" loading={create.isPending} onClick={submit}>
            만들기
          </Button>
        </div>
      </div>
    </Modal>
  )
}
