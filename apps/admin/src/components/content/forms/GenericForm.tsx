import { useState } from 'react'
import { Input } from '@cms/ui'
import { FormField } from './FormField'
import { SaveBar } from './HeroBannerForm'
import { ImageUploadField } from './ImageUploadField'
import { LATEST_BOARD_KEY, LATEST_KEYS, POST_COUNT_KEY, latestSettings } from './latestBoard'
import { LatestBoardFields } from './LatestBoardFields'
import { ListField } from './ListField'
import { isImageKey, parseList } from './listValue'
import { getSetting, isRichSetting, strSetting } from './utils'
import type { SectionFormProps } from './types'
import { fieldLabel } from '@/lib/fieldLabels'

// 게시판 샘플 글은 목록 편집기로 보여 주지 않는다 (실제 글은 문의 · 게시판 관리에서)
const RAW_LIST_TYPES = new Set(['BOARD', 'NOTICE_LATEST'])
// 게시판 섹션에서 고객이 고칠 칸이 아닌 것 — 샘플 글 · 게시판 종류 (T-139).
// 최신 글의 게시판 · 개수는 글자 칸이 아닌 선택 칸으로 따로 (T-185)
const HIDDEN_BOARD_KEYS = new Set(['items', 'sample_posts', 'board', ...LATEST_KEYS])
// 항목마다 늘 보여 줄 칸 — 슬라이드별 휴대폰용 사진 (T-037-E).
// 목록이 비어 있어도 새 슬라이드가 같은 칸으로 만들어지게 전체 칸을 적는다
const EXTRA_ITEM_KEYS: Record<string, string[]> = {
  slides: ['image_url', 'mobile_image_url', 'title', 'copy_primary', 'copy_secondary'],
}

/**
 * 매핑되지 않은 섹션 타입을 위한 fallback. 기존 settings를 그대로 편집.
 */
export function GenericForm({ section, isSaving, onSubmit }: SectionFormProps) {
  const isBoardSection = RAW_LIST_TYPES.has(section.section_type)
  const initial: Record<string, string> = Object.fromEntries(
    section.settings
      .filter((s) => !(isBoardSection && HIDDEN_BOARD_KEYS.has(s.field_key)))
      .map((s) => [s.field_key, getSetting(section.settings, s.field_key)])
  )
  const isNotice =
    section.section_type === 'NOTICE_LATEST' || getSetting(section.settings, 'board') === 'notice'
  const [values, setValues] = useState(initial)
  // 코드형 최신 공지 — 다른 게시판의 최신 글도 고를 수 있다 (T-185)
  const isLatest = section.section_type === 'NOTICE_LATEST'
  const [latest, setLatest] = useState({
    board: getSetting(section.settings, LATEST_BOARD_KEY),
    count: getSetting(section.settings, POST_COUNT_KEY),
  })

  // 목록 칸은 처음 값 기준으로 정한다 — 편집 중 잠깐 빈 목록이 돼도 편집기가 유지되게
  const [listKeys] = useState(
    () =>
      new Set(
        isBoardSection
          ? []
          : Object.entries(initial)
              .filter(([, v]) => parseList(v) !== null)
              .map(([k]) => k)
      )
  )

  const handleSave = async () => {
    await onSubmit([
      ...Object.entries(values).map(([key, value]) =>
        // 목록 칸은 JSON 그대로 (T-037-E)
        listKeys.has(key)
          ? { field_key: key, field_value: value, value_type: 'JSON' as const }
          : strSetting(key, value)
      ),
      ...(isLatest ? latestSettings(latest) : []),
    ])
  }

  if (section.settings.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
          이 섹션은 아직 편집 가능한 항목이 없습니다.
        </div>
      </div>
    )
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        handleSave()
      }}
    >
      {isNotice && (
        <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
          공지 글은{' '}
          <a href="/admin/boards" className="font-medium text-blue-600 underline">
            게시판 관리
          </a>
          에서 씁니다.
        </p>
      )}
      {isLatest && (
        <LatestBoardFields
          value={latest}
          onChange={setLatest}
          emptyLabel="공지사항 (기본)"
          defaultCount={4}
          hint="공개 글만 최신순으로 보여요. 고른 게시판을 찾을 수 없으면 공지사항을 보여 주고, 공개 글이 없으면 샘플 글이 보여요. 회원만 읽는 게시판은 고를 수 없어요."
        />
      )}
      {Object.entries(values).map(([key, value]) =>
        listKeys.has(key) ? (
          <ListField
            key={key}
            field={key}
            value={value}
            sectionId={section.id}
            extraKeys={EXTRA_ITEM_KEYS[key]}
            onChange={(json) => setValues((prev) => ({ ...prev, [key]: json }))}
          />
        ) : isImageKey(key) ? (
          // 사진 하나인 칸도 주소 입력 대신 업로드 (T-125-B)
          <ImageUploadField
            key={key}
            label={fieldLabel(key)}
            context={key === 'bg_image_url' ? 'hero' : 'gallery'}
            sectionId={section.id}
            value={value}
            onChange={(url) => setValues((prev) => ({ ...prev, [key]: url }))}
          />
        ) : (
          <FormField key={key} label={fieldLabel(key)} rich={isRichSetting(section.settings, key)}>
            <Input
              aria-label={fieldLabel(key)}
              value={value}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [key]: e.target.value }))
              }
            />
          </FormField>
        )
      )}
      <SaveBar isSaving={isSaving} />
    </form>
  )
}
