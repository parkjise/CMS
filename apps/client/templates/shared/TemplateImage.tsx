'use client'

import { useState, type ImgHTMLAttributes, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { ImagePlus } from 'lucide-react'
import { ImageUploadModal } from '@/components/edit/ImageUploadModal'
import { selectEditingUi, useEditStore } from '@/lib/editStore'
import { getString } from '@/lib/sectionSettings'
import type { ImageContext } from '@/lib/uploadImage'
import type { PublicSection } from '@/lib/publicSite.types'
import { ResponsiveImg } from './ResponsiveImg'

/** 목록 칸 안의 사진 — slides[2].image_url 처럼 (T-125-B) */
export interface ListImageTarget {
  /** 목록 칸 이름 (slides · cards …) */
  field: string
  index: number
  /** 항목 안 사진 키 (image_url · mobile_image_url …) */
  key: string
}

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet' | 'sizes'> {
  section: PublicSection
  editable: boolean
  /** 사진이 하나인 칸 이름 — 목록 안 사진이면 item 을 쓴다 */
  field?: string
  item?: Omit<ListImageTarget, 'key'> & { key?: string }
  /** 휴대폰용 사진 칸(또는 항목 키) — 있으면 '휴대폰 사진' 버튼도 보인다 */
  mobileKey?: string
  sizes: string
  maxWidth?: number
  context?: ImageContext
  /** 편집 버튼 묶음 위치 수정 — ImageEditButtons className */
  editClassName?: string
}

type Target = { field: string } | ListImageTarget

const isList = (t: Target): t is ListImageTarget => 'index' in t

const parseList = (raw: string | undefined): Record<string, unknown>[] | null => {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * 템플릿 사진 칸의 지금 값과 바꾸기 — 저장 전 바꾼 값(pendingChanges)이 있으면 그 값.
 * 목록 안 사진은 그 칸만 바꾼 목록 전체를 저장 대기에 올린다 — 같은 목록의 사진 여러 장을
 * 바꿔도 앞서 바꾼 값 위에 더하므로 서로 덮어쓰지 않는다.
 */
export function useTemplateImage(section: PublicSection, target: Target) {
  const storeKey = `${section.id}:${target.field}`
  const pending = useEditStore((s) => s.pendingChanges[storeKey])
  const updateField = useEditStore((s) => s.updateField)
  const initial = getString(section.settings, target.field)
  const current = pending?.new_value ?? initial

  if (!isList(target)) {
    return {
      url: current,
      replace: (url: string) => updateField(section.id, target.field, url, initial),
    }
  }

  const list = parseList(current)
  const value = list?.[target.index]?.[target.key]
  return {
    url: typeof value === 'string' ? value : '',
    replace: (url: string) => {
      // 최신 대기 값 위에서 바꾼다 — 렌더 뒤 다른 사진을 먼저 바꿨을 수도 있다
      const latest = useEditStore.getState().pendingChanges[storeKey]?.new_value ?? initial
      const next = parseList(latest)
      if (!next || !next[target.index]) return
      next[target.index] = { ...next[target.index], [target.key]: url }
      updateField(section.id, target.field, JSON.stringify(next), initial)
    },
  }
}

const EditButton = ({ label, onOpen }: { label: string; onOpen: () => void }) => (
  <button
    type="button"
    className="tpl-image-edit"
    onClick={(e: MouseEvent) => {
      // 카드 링크 안에 있어도 페이지 이동 · 슬라이드 넘김 없이 업로드 창만
      e.preventDefault()
      e.stopPropagation()
      onOpen()
    }}
  >
    <ImagePlus aria-hidden="true" />
    {label}
  </button>
)

interface EditButtonsProps {
  section: PublicSection
  editable: boolean
  field?: string
  item?: Omit<ListImageTarget, 'key'> & { key?: string }
  mobileKey?: string
  context?: ImageContext
  /** 버튼 묶음 위치 수정 (예: 헤더에 가리는 첫 화면은 아래로) */
  className?: string
  label?: string
}

const targetsOf = ({ field, item, mobileKey }: Pick<EditButtonsProps, 'field' | 'item' | 'mobileKey'>) => {
  if (item) {
    return {
      pc: { field: item.field, index: item.index, key: item.key ?? 'image_url' } as Target,
      mobile: { field: item.field, index: item.index, key: mobileKey ?? '' } as Target,
    }
  }
  return { pc: { field: field ?? '' } as Target, mobile: { field: mobileKey ?? '' } as Target }
}

/**
 * 편집 모드 '사진 변경' 버튼 묶음 (T-125-B) — 가장 가까운 position 조상의 오른쪽 위.
 * 사진을 직접 누르는 방식 대신 버튼을 쓰는 이유: 글자 · 슬라이드 조작 영역이 사진을 덮는 곳이 많다.
 * 샘플 섹션(editable=false) · 미리보기에서는 보이지 않는다.
 */
export function ImageEditButtons({
  section,
  editable,
  field,
  item,
  mobileKey,
  context = 'gallery',
  className,
  label,
}: EditButtonsProps) {
  const isEditing = useEditStore(selectEditingUi)
  const [open, setOpen] = useState<'pc' | 'mobile' | null>(null)
  const targets = targetsOf({ field, item, mobileKey })
  const pc = useTemplateImage(section, targets.pc)
  const mobile = useTemplateImage(section, targets.mobile)

  if (!editable || !isEditing) return null

  return (
    <span className={['tpl-image-edit-group', className].filter(Boolean).join(' ')}>
      <EditButton label={label ?? (item ? `${item.index + 1}번 사진 변경` : '사진 변경')} onOpen={() => setOpen('pc')} />
      {mobileKey && <EditButton label="휴대폰 사진" onOpen={() => setOpen('mobile')} />}
      {/* body 로 — 슬라이드(transform) · overflow:hidden 안에 갇히지 않게 */}
      {open !== null &&
        createPortal(
          <ImageUploadModal
            open
            onClose={() => setOpen(null)}
            onUploaded={(url) => (open === 'mobile' ? mobile : pc).replace(url)}
            sectionId={section.id}
            context={context}
          />,
          document.body,
        )}
    </span>
  )
}

/**
 * 코드형 템플릿 사진 (T-125-B) — 방문자 화면은 ResponsiveImg 그대로(목업 마크업 · 최적화 유지),
 * 저장 전 바꾼 사진은 바로 보여 주고, 편집 모드에서는 '사진 변경' 버튼을 함께 그린다.
 * 같은 사진을 여러 곳에 보이는 곳(썸네일 · 반복 슬라이드)은 한 곳만 editable 로 둔다.
 */
export function TemplateImage({
  section,
  editable,
  field,
  item,
  mobileKey,
  sizes,
  maxWidth,
  context,
  editClassName,
  ...imgProps
}: Props) {
  const targets = targetsOf({ field, item, mobileKey })
  const pc = useTemplateImage(section, targets.pc)
  const mobile = useTemplateImage(section, targets.mobile)
  const mobileUrl = mobileKey ? mobile.url : ''

  return (
    <>
      {pc.url && (
        <ResponsiveImg src={pc.url} mobileSrc={mobileUrl || undefined} sizes={sizes} maxWidth={maxWidth} {...imgProps} />
      )}
      <ImageEditButtons
        section={section}
        editable={editable}
        field={field}
        item={item}
        mobileKey={mobileKey}
        context={context}
        className={editClassName}
      />
    </>
  )
}
