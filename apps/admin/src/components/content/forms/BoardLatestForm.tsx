import { useState } from 'react'
import { Input } from '@cms/ui'
import { FormField } from './FormField'
import { SaveBar } from './HeroBannerForm'
import { LATEST_BOARD_KEY, POST_COUNT_KEY, latestSettings } from './latestBoard'
import { LatestBoardFields } from './LatestBoardFields'
import { getSetting, strSetting } from './utils'
import type { SectionFormProps } from './types'

const TITLE_MAX = 40

/** 테마형 메인 화면 최신 글 (T-185) */
export function BoardLatestForm({ section, isSaving, onSubmit }: SectionFormProps) {
  const [title, setTitle] = useState(getSetting(section.settings, 'section_title'))
  const [latest, setLatest] = useState({
    board: getSetting(section.settings, LATEST_BOARD_KEY),
    count: getSetting(section.settings, POST_COUNT_KEY),
  })
  const overLimit = title.length > TITLE_MAX

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (!overLimit) onSubmit([strSetting('section_title', title), ...latestSettings(latest)])
      }}
    >
      <FormField label="섹션 제목" hint={overLimit ? `${TITLE_MAX}자 이하로 적어 주세요.` : undefined}>
        <Input
          aria-label="섹션 제목"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="최신 글"
        />
      </FormField>
      <LatestBoardFields
        value={latest}
        onChange={setLatest}
        emptyLabel="선택하세요"
        defaultCount={5}
        hint="공개 글만 최신순으로 보여요. 게시판을 고르지 않았거나, 비활성 게시판이거나, 공개 글이 없으면 홈페이지에서 이 섹션이 보이지 않아요. 회원만 읽는 게시판은 고를 수 없어요."
      />
      <SaveBar isSaving={isSaving} disabled={overLimit} />
    </form>
  )
}
