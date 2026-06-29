import { useState } from 'react'
import { Modal } from '@cms/ui'

interface SearchConsoleGuideModalProps {
  open: boolean
  onClose: () => void
}

type Provider = 'google' | 'naver'

const GUIDES: Record<
  Provider,
  { name: string; url: string; steps: string[] }
> = {
  google: {
    name: 'Google 서치 콘솔',
    url: 'https://search.google.com/search-console',
    steps: [
      'Google 서치 콘솔에 접속해 로그인합니다.',
      '"속성 추가" → "URL 접두어"에 내 홈페이지 주소를 입력합니다.',
      '소유권 확인 방법에서 "HTML 태그"를 선택합니다.',
      'meta 태그의 content 값(verification 코드)만 복사합니다.',
      '아래 "Google 사이트 인증 코드" 입력란에 붙여넣고 저장합니다.',
      '서치 콘솔로 돌아가 "확인" 버튼을 누르면 인증이 완료됩니다.',
    ],
  },
  naver: {
    name: '네이버 서치어드바이저',
    url: 'https://searchadvisor.naver.com',
    steps: [
      '네이버 서치어드바이저에 접속해 로그인합니다.',
      '"웹마스터 도구" → "사이트 등록"에 홈페이지 주소를 입력합니다.',
      '소유 확인에서 "HTML 태그"를 선택합니다.',
      'meta 태그의 content 값만 복사합니다.',
      '아래 "네이버 사이트 검증 코드" 입력란에 붙여넣고 저장합니다.',
      '서치어드바이저에서 "소유확인" 버튼을 누르면 완료됩니다.',
    ],
  },
}

export function SearchConsoleGuideModal({
  open,
  onClose,
}: SearchConsoleGuideModalProps) {
  const [provider, setProvider] = useState<Provider>('google')
  const guide = GUIDES[provider]

  return (
    <Modal open={open} onClose={onClose} title="검색엔진 사이트 등록 가이드" size="lg">
      <div className="space-y-4">
        <div className="flex gap-2" role="tablist">
          {(['google', 'naver'] as Provider[]).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={provider === p}
              onClick={() => setProvider(p)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                provider === p
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {GUIDES[p].name}
            </button>
          ))}
        </div>

        <a
          href={guide.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm font-medium text-blue-600 hover:underline"
        >
          {guide.name} 바로가기 ↗
        </a>

        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
          {guide.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>

        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
          meta 태그 전체가 아니라 <strong>content="..." 안의 코드 값만</strong>{' '}
          입력하세요.
        </p>
      </div>
    </Modal>
  )
}
