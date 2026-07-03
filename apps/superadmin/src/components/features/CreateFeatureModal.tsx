import { useEffect, useState } from 'react'
import { Button, Input, Modal, Toggle, toast } from '@cms/ui'
import {
  useCreateFeature,
  useUpdateFeature,
  type FeatureItem,
} from '@/hooks/useFeatures'

interface Props {
  open: boolean
  onClose: () => void
  /** 있으면 수정 모드 */
  feature?: FeatureItem | null
}

const CATEGORIES = ['CONTENT', 'NOTIFICATION', 'AI', 'SEO', 'ANALYTICS', 'INTEGRATION']

const EMPTY = {
  key: '',
  name: '',
  category: 'CONTENT',
  description: '',
  menu_path: '',
  menu_icon: '',
  menu_label: '',
  required_plan: '',
  is_beta: false,
}

export function CreateFeatureModal({ open, onClose, feature }: Props) {
  const isEdit = !!feature
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const create = useCreateFeature()
  const update = useUpdateFeature()

  useEffect(() => {
    if (feature) {
      setForm({
        key: feature.key,
        name: feature.name,
        category: feature.category,
        description: feature.description ?? '',
        menu_path: feature.menu_path ?? '',
        menu_icon: feature.menu_icon ?? '',
        menu_label: feature.menu_label ?? '',
        required_plan: feature.required_plan ?? '',
        is_beta: feature.is_beta,
      })
    } else {
      setForm(EMPTY)
    }
    setError('')
  }, [feature, open])

  const set = (k: keyof typeof EMPTY, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    setError('')
    if (!form.name || (!isEdit && !form.key)) {
      setError('key와 name은 필수입니다.')
      return
    }
    const payload = {
      name: form.name,
      category: form.category,
      description: form.description || undefined,
      menu_path: form.menu_path || undefined,
      menu_icon: form.menu_icon || undefined,
      menu_label: form.menu_label || undefined,
      required_plan: form.required_plan || null,
      is_beta: form.is_beta,
    }
    try {
      if (isEdit && feature) {
        await update.mutateAsync({ id: feature.id, patch: payload })
        toast.success('기능이 수정되었습니다.')
      } else {
        await create.mutateAsync({ key: form.key, ...payload })
        toast.success('기능이 등록되었습니다.')
      }
      onClose()
    } catch {
      setError('저장에 실패했습니다. key 중복 여부를 확인하세요.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? '기능 수정' : '새 기능 등록'}>
      <div className="space-y-3">
        <Input
          label="key (UPPER_SNAKE_CASE)"
          value={form.key}
          onChange={(e) => set('key', e.target.value.toUpperCase())}
          disabled={isEdit}
        />
        <Input label="이름" value={form.name} onChange={(e) => set('name', e.target.value)} />
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            카테고리
          </label>
          <select
            value={form.category}
            onChange={(e) => set('category', e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="메뉴 경로"
            value={form.menu_path}
            onChange={(e) => set('menu_path', e.target.value)}
            placeholder="/admin/reports"
          />
          <Input
            label="메뉴 라벨"
            value={form.menu_label}
            onChange={(e) => set('menu_label', e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="메뉴 아이콘"
            value={form.menu_icon}
            onChange={(e) => set('menu_icon', e.target.value)}
            placeholder="chart-bar"
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              필요 플랜
            </label>
            <select
              value={form.required_plan}
              onChange={(e) => set('required_plan', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">전체 플랜</option>
              <option value="STANDARD">STANDARD 이상</option>
              <option value="PREMIUM">PREMIUM 전용</option>
            </select>
          </div>
        </div>
        <Toggle
          label="BETA 기능"
          checked={form.is_beta}
          onChange={(e) => set('is_beta', e.target.checked)}
        />
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            onClick={handleSubmit}
            loading={create.isPending || update.isPending}
          >
            {isEdit ? '저장' : '등록'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
