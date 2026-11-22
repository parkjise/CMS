import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  CornerDownRight,
  ExternalLink,
  EyeOff,
  Plus,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import type { MenuNode, MenuNodeType, SiteMenu } from '@cms/types'
import { Button, Input, Modal, Toggle, toast } from '@cms/ui'
import { FormField } from '@/components/content/forms/FormField'
import { LeaveGuard } from '@/components/site/LeaveGuard'
import { SaveBar } from '@/components/site/SaveBar'
import { SITE_CARD } from '@/components/site/SitePage'
import { useCanEdit } from '@/hooks/useCanEdit'
import { useResetSiteMenu, useSiteMenu, useUpdateSiteMenu } from '@/hooks/useSiteSettings'
import { pickErrorMessage } from '@/lib/errorMessages'
import {
  MENU_LABEL_MAX,
  appendTo,
  findNode,
  flatten,
  moveWithin,
  newNodeId,
  nodeWarning,
  parentChoices,
  removeNode,
  reparent,
  treeError,
  updateNode,
} from '@/lib/menuTree'

/**
 * 사이트 관리 → 메뉴 관리 (T-223, 사이트 관리 기획서 SM-02 · 와이어프레임 02 · 04)
 * 3단계 메뉴 트리 — 연결 유형(페이지 / 게시판 / 외부 URL / 하위 메뉴 묶음) · 열기 방식 · 보이기.
 * 메뉴는 연결만 한다 — 메뉴를 지워도 페이지 · 게시판은 그대로다.
 */

const TYPE_LABEL: Record<MenuNodeType, string> = {
  page: '페이지',
  board: '게시판',
  url: '외부 URL',
  group: '하위 메뉴 묶음',
}

const SELECT = 'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900'

const sameTree = (a: MenuNode[], b: MenuNode[]) => JSON.stringify(a) === JSON.stringify(b)

interface DetailProps {
  menu: SiteMenu
  nodes: MenuNode[]
  node: MenuNode
  onChange: (change: Partial<MenuNode>) => void
  onReparent: (parentId: string | null) => void
  onDelete: () => void
}

function NodeDetail({ menu, nodes, node, onChange, onReparent, onDelete }: DetailProps) {
  const parentId = flatten(nodes).find((f) => f.node.id === node.id)?.parentId ?? null
  const parents = parentChoices(nodes, node.id, menu.max_depth)
  const warning = nodeWarning(node, menu.pages, menu.boards)
  const board = node.type === 'board' ? menu.boards.find((b) => b.id === node.target) : undefined
  const pageLabel = (key: string) => {
    const page = menu.pages.find((p) => p.key === key)
    const parent = page?.parent ? menu.pages.find((p) => p.key === page.parent) : undefined
    return parent ? `${parent.label} › ${page?.label}` : (page?.label ?? key)
  }

  // 연결 유형을 바꾸면 대상은 첫 후보로 — 다시 고를 수 있다
  const changeType = (type: MenuNodeType) => {
    const firstTarget: Record<MenuNodeType, string | null> = {
      page: menu.pages[0]?.key ?? null,
      board: (menu.boards.find((b) => b.active) ?? menu.boards[0])?.id ?? null,
      url: 'https://',
      group: null,
    }
    onChange({ type, target: firstTarget[type] })
  }

  return (
    <section className={`${SITE_CARD} min-w-0`} aria-labelledby="menu-detail-title">
      <h2 id="menu-detail-title" className="text-base font-semibold text-slate-900">
        메뉴 설정
      </h2>
      <FormField label="메뉴명" htmlFor="menu-label" hint={`${MENU_LABEL_MAX}자 이내`}>
        <Input
          id="menu-label"
          value={node.label}
          maxLength={MENU_LABEL_MAX}
          error={node.label.trim() ? undefined : '메뉴 이름을 입력해 주세요.'}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </FormField>
      <FormField
        label="상위 메뉴"
        htmlFor="menu-parent"
        hint={`최대 ${menu.max_depth}단계 — 자기 자신과 하위 메뉴는 고를 수 없어요.`}
      >
        <select
          id="menu-parent"
          className={SELECT}
          value={parentId ?? ''}
          onChange={(e) => onReparent(e.target.value || null)}
        >
          <option value="">최상위 메뉴</option>
          {parents.map((f) => (
            <option key={f.node.id} value={f.node.id}>
              {`${'　'.repeat(f.depth - 1)}${f.node.label || '(이름 없음)'}`}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="연결 유형" htmlFor="menu-type">
        <select
          id="menu-type"
          className={SELECT}
          value={node.type}
          onChange={(e) => changeType(e.target.value as MenuNodeType)}
        >
          {(Object.keys(TYPE_LABEL) as MenuNodeType[]).map((type) => (
            <option key={type} value={type}>
              {TYPE_LABEL[type]}
            </option>
          ))}
        </select>
      </FormField>

      {node.type === 'page' && (
        <FormField
          label="연결 대상"
          htmlFor="menu-target"
          hint={menu.mode === 'theme' ? '테마형은 홈 화면의 섹션으로 내려가요.' : undefined}
        >
          <select
            id="menu-target"
            className={SELECT}
            value={node.target ?? ''}
            onChange={(e) => onChange({ target: e.target.value })}
          >
            {!menu.pages.some((p) => p.key === node.target) && (
              <option value={node.target ?? ''}>(없는 페이지)</option>
            )}
            {menu.pages.map((page) => (
              <option key={page.key} value={page.key}>
                {pageLabel(page.key)}
              </option>
            ))}
          </select>
        </FormField>
      )}
      {node.type === 'board' && (
        <FormField
          label="연결 대상"
          htmlFor="menu-target"
          hint={
            board?.member_only
              ? '회원만 읽는 게시판이에요 — 방문자는 로그인 안내를 봐요.'
              : undefined
          }
        >
          <select
            id="menu-target"
            className={SELECT}
            value={node.target ?? ''}
            onChange={(e) => onChange({ target: e.target.value })}
          >
            {!board && <option value={node.target ?? ''}>(지운 게시판)</option>}
            {menu.boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.active ? '' : ' (사용 안 함)'}
              </option>
            ))}
          </select>
        </FormField>
      )}
      {node.type === 'url' && (
        <FormField
          label="연결 주소"
          htmlFor="menu-target"
          hint="http:// 또는 https:// 로 시작하는 주소"
        >
          <Input
            id="menu-target"
            value={node.target ?? ''}
            placeholder="https://blog.example.com"
            onChange={(e) => onChange({ target: e.target.value })}
          />
        </FormField>
      )}

      {node.type !== 'group' && (
        <FormField
          label="열기 방식"
          htmlFor="menu-window"
          hint={node.new_window ? '새 창은 안전한 링크 속성(noopener)으로 열어요.' : undefined}
        >
          <select
            id="menu-window"
            className={SELECT}
            value={node.new_window ? 'new' : 'same'}
            onChange={(e) => onChange({ new_window: e.target.value === 'new' })}
          >
            <option value="same">현재 창</option>
            <option value="new">새 창</option>
          </select>
        </FormField>
      )}
      <Toggle
        checked={node.visible}
        onChange={(e) => onChange({ visible: e.target.checked })}
        label="홈페이지 메뉴에 보이기"
        description="끄면 하위 메뉴도 함께 숨겨요. 페이지 · 게시판은 주소로 그대로 열려요."
      />
      {warning && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700" role="note">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {warning}
        </p>
      )}
      <div className="border-t border-slate-100 pt-4">
        <Button type="button" variant="secondary" onClick={onDelete}>
          <Trash2 className="mr-1.5 h-4 w-4" aria-hidden />
          선택 메뉴 삭제
        </Button>
        <p className="mt-2 text-xs text-slate-500">
          메뉴만 지워요 — 연결한 페이지 · 게시판은 지워지지 않아요.
        </p>
      </div>
    </section>
  )
}

interface TreeProps {
  menu: SiteMenu
  nodes: MenuNode[]
  selected: string | null
  onSelect: (id: string) => void
  onMove: (id: string, delta: -1 | 1) => void
}

function MenuTree({ menu, nodes, selected, onSelect, onMove }: TreeProps) {
  const rows = flatten(nodes)
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
        메뉴가 없어요. [메뉴 추가]로 첫 메뉴를 만들어 보세요.
      </p>
    )
  }
  return (
    <ul
      className="divide-y divide-slate-100 rounded-md border border-slate-200"
      aria-label="메뉴 구성"
    >
      {rows.map(({ node, depth, index, siblings }) => {
        const warning = nodeWarning(node, menu.pages, menu.boards)
        const active = node.id === selected
        return (
          <li
            key={node.id}
            className={`flex items-center gap-2 py-2 pr-2 ${active ? 'bg-blue-50' : ''}`}
            style={{ paddingLeft: `${0.75 + (depth - 1) * 1.5}rem` }}
          >
            {depth > 1 && (
              <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
            )}
            <button
              type="button"
              onClick={() => onSelect(node.id)}
              aria-current={active ? 'true' : undefined}
              className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
            >
              <span
                className={`truncate font-medium ${node.visible ? 'text-slate-800' : 'text-slate-400'}`}
              >
                {node.label || '(이름 없음)'}
              </span>
              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                {TYPE_LABEL[node.type]}
              </span>
              {node.new_window && (
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="새 창" />
              )}
              {!node.visible && (
                <EyeOff className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="숨김" />
              )}
              {warning && (
                <TriangleAlert
                  className="h-3.5 w-3.5 shrink-0 text-amber-600"
                  aria-label={warning}
                />
              )}
            </button>
            <Button
              type="button"
              variant="ghost"
              aria-label={`${node.label} 위로`}
              disabled={index === 0}
              onClick={() => onMove(node.id, -1)}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              aria-label={`${node.label} 아래로`}
              disabled={index === siblings - 1}
              onClick={() => onMove(node.id, 1)}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </li>
        )
      })}
    </ul>
  )
}

export function MenuTreeEditor() {
  const query = useSiteMenu()
  const save = useUpdateSiteMenu()
  const reset = useResetSiteMenu()
  const canEdit = useCanEdit()
  const menu = query.data
  const savedNodes = useMemo(() => menu?.nodes ?? [], [menu])
  const [nodes, setNodes] = useState<MenuNode[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<MenuNode | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const dirty = Boolean(menu) && !sameTree(nodes, savedNodes)

  useEffect(() => {
    if (!menu) return
    setNodes(menu.nodes)
    setSelected((current) =>
      current && findNode(menu.nodes, current) ? current : (menu.nodes[0]?.id ?? null)
    )
  }, [menu])

  if (query.isLoading) {
    return (
      <div
        role="status"
        aria-label="메뉴 불러오는 중"
        className="h-72 animate-pulse rounded-lg bg-slate-100"
      />
    )
  }
  if (query.isError || !menu) {
    return <p className="text-sm text-red-600">메뉴를 불러오지 못했습니다.</p>
  }

  const node = selected ? findNode(nodes, selected) : null
  const error = treeError(nodes)

  const add = () => {
    const created: MenuNode = {
      id: newNodeId(),
      label: '새 메뉴',
      type: 'group',
      target: null,
      new_window: false,
      visible: true,
      children: [],
    }
    setNodes((list) => appendTo(list, null, created))
    setSelected(created.id)
  }

  const remove = (target: MenuNode, keepChildren: boolean) => {
    setNodes((list) => removeNode(list, target.id, keepChildren))
    setSelected(null)
    setDeleting(null)
  }

  // 성공 여부를 돌려준다 — 나가기 확인의 [저장하고 이동] (T-227)
  const handleSave = async () => {
    if (error) {
      toast.error(error)
      return false
    }
    try {
      await save.mutateAsync(
        nodes.map(function trim(n): MenuNode {
          return {
            ...n,
            label: n.label.trim(),
            target: n.target?.trim() || null,
            children: n.children.map(trim),
          }
        })
      )
      toast.success('메뉴를 저장했습니다. 홈페이지에 바로 반영돼요.')
      return true
    } catch (err) {
      toast.error(pickErrorMessage(err, '메뉴를 저장하지 못했습니다.'))
      return false
    }
  }

  return (
    <div className="space-y-6">
      {!menu.saved && (
        <p className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800" role="note">
          지금 홈페이지 메뉴를 그대로 불러왔어요.
          {menu.mode === 'code' ? ' 하위 페이지는 하위 메뉴로 넣어 두었어요.' : ''} 저장하면 이
          구성이 홈페이지 메뉴가 돼요.
        </p>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section className={`${SITE_CARD} min-w-0`} aria-labelledby="menu-tree-title">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="menu-tree-title" className="mr-auto text-base font-semibold text-slate-900">
              사이트 메뉴 구성
            </h2>
            <Button type="button" variant="secondary" onClick={add}>
              <Plus className="mr-1 h-4 w-4" aria-hidden />
              메뉴 추가
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            위 · 아래 버튼으로 같은 단계 안 순서를, 상위 메뉴로 단계를 바꿔요. 저장한 뒤 새로 만든
            게시판은 메뉴 끝에 자동으로 붙어요.
          </p>
          <MenuTree
            menu={menu}
            nodes={nodes}
            selected={selected}
            onSelect={setSelected}
            onMove={(id, delta) => setNodes((list) => moveWithin(list, id, delta))}
          />
          {menu.saved && canEdit && (
            <button
              type="button"
              className="text-xs font-medium text-slate-500 underline-offset-2 hover:underline"
              onClick={() => setConfirmReset(true)}
            >
              템플릿 기본 메뉴로 되돌리기
            </button>
          )}
        </section>
        {node ? (
          <NodeDetail
            menu={menu}
            nodes={nodes}
            node={node}
            onChange={(change) => setNodes((list) => updateNode(list, node.id, change))}
            onReparent={(parentId) =>
              setNodes((list) => reparent(list, node.id, parentId, menu.max_depth))
            }
            onDelete={() => (node.children.length > 0 ? setDeleting(node) : remove(node, false))}
          />
        ) : (
          <section className={`${SITE_CARD} text-center text-sm text-slate-500`}>
            왼쪽에서 메뉴를 골라 주세요.
          </section>
        )}
      </div>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="하위 메뉴가 있는 메뉴 삭제"
      >
        <p className="text-sm text-slate-600">
          '{deleting?.label}' 아래에 하위 메뉴 {deleting?.children.length}개가 있어요. 어떻게
          할까요?
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => setDeleting(null)}>
            취소
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => deleting && remove(deleting, true)}
          >
            하위 메뉴는 위로 옮기기
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={() => deleting && remove(deleting, false)}
          >
            함께 삭제
          </Button>
        </div>
      </Modal>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="기본 메뉴로 되돌리기"
      >
        <p className="text-sm text-slate-600">
          저장한 메뉴 구성을 지우고 지금 템플릿의 기본 메뉴로 돌아가요. 페이지 · 게시판은 지워지지
          않아요.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => setConfirmReset(false)}>
            취소
          </Button>
          <Button
            type="button"
            loading={reset.isPending}
            onClick={() =>
              reset.mutate(undefined, {
                onSuccess: () => {
                  setConfirmReset(false)
                  toast.success('기본 메뉴로 되돌렸습니다.')
                },
                onError: (err) => toast.error(pickErrorMessage(err, '되돌리지 못했습니다.')),
              })
            }
          >
            되돌리기
          </Button>
        </div>
      </Modal>

      {dirty && error && (
        <p className="text-sm text-rose-600" role="alert">
          {error}
        </p>
      )}
      <SaveBar
        dirty={dirty}
        saving={save.isPending}
        onReset={() => setNodes(savedNodes)}
        onSave={() => void handleSave()}
      />
      <LeaveGuard dirty={dirty} onSave={handleSave} saveBlockedReason={error ?? undefined} />
    </div>
  )
}
