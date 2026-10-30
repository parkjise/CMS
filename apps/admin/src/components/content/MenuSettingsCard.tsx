import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Menu } from 'lucide-react'
import { Button, Input, toast } from '@cms/ui'
import { type MenuItem, useSiteMenu, useUpdateSiteMenu } from '@/hooks/useSiteSettings'
import { pickErrorMessage } from '@/lib/errorMessages'

const LABEL_MAX = 20

/**
 * 공통 설정 → 상단 메뉴 (기획서 AD-02-A, T-036-B)
 * 메뉴 이름 · 보이기 · (코드형) 순서. 테마형 메뉴 순서는 섹션 순서를 따른다.
 */
export function MenuSettingsCard() {
  const query = useSiteMenu()
  const save = useUpdateSiteMenu()
  const [items, setItems] = useState<MenuItem[]>([])

  useEffect(() => {
    if (query.data) setItems(query.data.items)
  }, [query.data])

  if (query.isLoading) {
    return <div role="status" aria-label="상단 메뉴 불러오는 중" className="h-48 animate-pulse rounded-lg bg-slate-100" />
  }
  if (!query.data) return null
  const { reorderable } = query.data

  const patch = (key: string, change: Partial<MenuItem>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...change } : i)))

  const move = (index: number, delta: -1 | 1) =>
    setItems((list) => {
      const next = [...list]
      const [item] = next.splice(index, 1)
      next.splice(index + delta, 0, item)
      return next
    })

  const submit = (payload: MenuItem[], message: string) =>
    save.mutate(
      payload.map((i) => ({ key: i.key, label: i.label?.trim() || null, visible: i.visible })),
      {
        onSuccess: () => toast.success(message),
        onError: (err) => toast.error(pickErrorMessage(err, '메뉴를 저장하지 못했습니다.')),
      },
    )

  const tooLong = items.some((i) => (i.label ?? '').trim().length > LABEL_MAX)

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:p-6" aria-labelledby="menu-settings-title">
      <h2 id="menu-settings-title" className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <Menu className="h-4 w-4 text-slate-500" aria-hidden="true" /> 상단 메뉴
      </h2>
      <p className="text-sm text-slate-500">
        홈페이지 맨 위 메뉴에 보일 이름과 보이기를 정해요. 비워 둔 이름은 기본 이름을 씁니다.
        {reorderable ? '' : ' 메뉴 순서는 섹션 순서를 따라요 — 섹션 관리 탭에서 끌어서 바꾸세요.'}
      </p>

      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
          메뉴로 보일 섹션이 아직 없어요.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
          {items.map((item, index) => (
            <li key={item.key} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={item.visible}
                  onChange={(e) => patch(item.key, { visible: e.target.checked })}
                  aria-label={`${item.default_label} 메뉴 보이기`}
                />
              </label>
              <div className="min-w-[10rem] flex-1">
                <Input
                  value={item.label ?? ''}
                  placeholder={item.default_label}
                  aria-label={`${item.default_label} 메뉴 이름`}
                  maxLength={LABEL_MAX}
                  disabled={!item.visible}
                  onChange={(e) => patch(item.key, { label: e.target.value })}
                />
              </div>
              {reorderable && (
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`${item.default_label} 위로`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`${item.default_label} 아래로`}
                    disabled={index === items.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={save.isPending}
          onClick={() => submit([], '메뉴를 기본값으로 되돌렸습니다.')}
        >
          기본값으로
        </Button>
        <Button type="button" disabled={save.isPending || tooLong || items.length === 0} onClick={() => submit(items, '상단 메뉴를 저장했습니다.')}>
          {save.isPending ? '저장 중…' : '메뉴 저장'}
        </Button>
      </div>
    </section>
  )
}
