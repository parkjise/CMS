import { useState } from 'react'
import { Image, Monitor, Smartphone, Tablet } from 'lucide-react'
import type { BoardDesign, BoardType } from '@cms/types'

interface BoardDesignPreviewProps {
  name: string
  type: BoardType
  design: BoardDesign
}

type Device = 'pc' | 'tablet' | 'mobile'

const DEVICES: { value: Device; label: string; Icon: typeof Monitor }[] = [
  { value: 'pc', label: 'PC', Icon: Monitor },
  { value: 'tablet', label: '태블릿', Icon: Tablet },
  { value: 'mobile', label: '모바일', Icon: Smartphone },
]
const FRAME_WIDTH: Record<Device, string> = {
  pc: 'w-full',
  tablet: 'w-[620px] max-w-full',
  mobile: 'w-[340px] max-w-full',
}
const GRID_COLUMNS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
}
const RATIO: Record<BoardDesign['image_ratio'], string> = {
  '1:1': 'aspect-square',
  '4:3': 'aspect-[4/3]',
  '16:9': 'aspect-video',
}
const SAMPLES = [
  '홈페이지 리뉴얼 오픈 안내',
  '새로운 서비스와 혜택을 소개합니다',
  '이용 안내 및 자주 묻는 질문',
  '함께 만드는 더 나은 경험',
]

/** 디자인 미리보기 (T-187) — 샘플 글로만 그린다. 저장 전 설정을 바로 보여 주고 서버에 묻지 않는다 */
export function BoardDesignPreview({ name, type, design }: BoardDesignPreviewProps) {
  const [device, setDevice] = useState<Device>('pc')
  const columns = device === 'mobile' ? 1 : device === 'tablet' ? 2 : design.columns

  return (
    <section
      aria-label="게시판 디자인 미리보기"
      className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100 px-4 pb-4 sm:px-5 sm:pb-5"
    >
      <div className="flex h-14 items-center justify-between gap-3 text-xs text-slate-500">
        <strong className="font-semibold text-slate-700">사이트 미리보기</strong>
        <div className="flex gap-0.5 rounded-lg bg-slate-200/70 p-0.5">
          {DEVICES.map(({ value, label, Icon }) => (
            <button
              type="button"
              key={value}
              aria-label={`${label} 미리보기`}
              aria-pressed={device === value}
              onClick={() => setDevice(value)}
              className={`rounded-md px-2.5 py-1.5 ${device === value ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </button>
          ))}
        </div>
        <span>샘플 콘텐츠</span>
      </div>

      <div
        className={`mx-auto overflow-hidden rounded-lg border border-slate-200 bg-white transition-[width] ${FRAME_WIDTH[device]}`}
      >
        <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-3 py-2.5">
          {[0, 1, 2].map((dot) => (
            <i key={dot} className="h-1.5 w-1.5 rounded-full bg-slate-300" />
          ))}
          <span className="flex-1 text-center text-[10px] text-slate-400">
            게시판 레이아웃 미리보기
          </span>
        </div>
        <div className="bg-slate-100 px-5 py-9 text-center">
          <small className="font-serif text-xs text-slate-400">BOARD</small>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-800">{name}</h2>
          <p className="mt-2 text-[10px] text-slate-400">사이트의 다양한 소식을 확인해 보세요.</p>
        </div>

        <div className="px-[6%] py-7 text-slate-700">
          {type === 'FAQ' ? (
            SAMPLES.map((title, index) => (
              <details
                key={`${title}:${design.faq_first_open}`}
                name={design.faq_single_open ? 'preview-faq' : undefined}
                open={index === 0 && design.faq_first_open ? true : undefined}
                className="border-b border-slate-100 py-3.5 text-xs"
              >
                <summary className="cursor-pointer font-medium">Q. {title}</summary>
                <p className="mt-2 text-slate-500">
                  자주 문의하시는 내용에 대한 답변이 표시됩니다.
                </p>
              </details>
            ))
          ) : type === 'LIST' ? (
            SAMPLES.map((title, index) => (
              <div
                key={title}
                className="flex justify-between gap-3 border-b border-slate-100 py-3.5 text-xs"
              >
                <span>
                  {index === 0 && (
                    <em className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] not-italic text-slate-500">
                      공지
                    </em>
                  )}
                  {title}
                </span>
                {design.show_date && (
                  <time className="whitespace-nowrap text-[10px] text-slate-400">2026.11.11</time>
                )}
              </div>
            ))
          ) : (
            <div className={`grid gap-3 ${GRID_COLUMNS[columns] ?? 'grid-cols-3'}`}>
              {SAMPLES.map((title) => (
                <article
                  key={title}
                  className="overflow-hidden rounded-md border border-slate-200 text-xs"
                >
                  {(type === 'GALLERY' || design.show_image) && (
                    <div
                      className={`grid place-items-center gap-1 bg-gradient-to-br from-slate-200 to-stone-100 text-slate-400 ${RATIO[design.image_ratio]}`}
                    >
                      <Image className="h-6 w-6" aria-hidden />
                    </div>
                  )}
                  <div className="space-y-1 p-3">
                    <strong className="block font-medium">{title}</strong>
                    {type === 'CARD' && design.show_summary && (
                      <p className="text-slate-500">게시글의 요약 내용이 이곳에 표시됩니다.</p>
                    )}
                    {design.show_date && (
                      <time className="block text-[10px] text-slate-400">2026.11.11</time>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
          <p className="pt-6 text-center text-[11px] text-slate-500">
            ‹ <strong className="mx-1 rounded bg-slate-800 px-2 py-1 text-white">1</strong> 2 3 ›
          </p>
        </div>
        <div className="bg-slate-800 px-5 py-5 text-center text-[10px] text-slate-300">
          사이트 공통 푸터
        </div>
      </div>
      <p className="mt-4 text-center text-[11px] text-slate-500">
        샘플 레이아웃입니다. 실제 사이트는 적용된 템플릿에 따라 다르게 보일 수 있어요.
      </p>
    </section>
  )
}
