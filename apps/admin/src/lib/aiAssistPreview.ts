import type {
  AssistInputs,
  AssistKind,
  AssistResponse,
  AssistResults,
  AssistTone,
} from '@/lib/aiAssist'

/**
 * 미리보기 모드의 예시 결과 (T-231-A ~ T-234-A) — 개발 서버에서만 읽는다(동적 import).
 * 서버 응답과 같은 모양이라 서버를 붙여도 화면은 그대로다.
 */
const SEO: Record<AssistTone, AssistResponse<'seo'>['result']> = {
  trust: {
    meta_title: '바른치과의원 | 강남역 임플란트 · 치아 교정',
    meta_description:
      '강남역 2번 출구 앞 바른치과의원입니다. 임플란트와 치아 교정을 전문으로, 진료 전 충분한 상담으로 치료 계획을 함께 정합니다. 평일 야간 진료.',
    keywords: ['강남 치과', '임플란트', '치아 교정', '강남역 치과', '야간 진료'],
  },
  friendly: {
    meta_title: '바른치과의원 — 강남역에서 편하게 만나는 치과',
    meta_description:
      '치과가 무서운 분도 편하게 오세요. 강남역 바로 앞, 임플란트 · 교정 · 스케일링까지 꼼꼼하게 상담해 드려요. 퇴근 뒤 야간 진료도 해요.',
    keywords: ['강남 치과', '편한 치과', '임플란트', '교정', '스케일링'],
  },
  expert: {
    meta_title: '바른치과의원 | 임플란트 · 교정 진료 (강남)',
    meta_description:
      '바른치과의원은 임플란트 식립과 치아 교정 진료를 중심으로 정밀 진단 후 치료 계획을 세웁니다. 강남역 인근, 평일 야간 진료.',
    keywords: ['임플란트 식립', '치아 교정', '정밀 진단', '강남 치과', '치과 진료'],
  },
}

const GEO: Record<AssistTone, AssistResponse<'geo'>['result']> = {
  trust: {
    description:
      '바른치과의원은 강남역 인근에서 임플란트와 치아 교정을 중심으로 진료하는 치과입니다. 진료 전 상담에서 치료 방법과 기간, 비용을 먼저 안내하고, 평일 야간 진료로 직장인도 다니기 쉽게 운영합니다.',
    topics: ['임플란트', '치아 교정', '스케일링', '야간 진료', '강남 치과'],
  },
  friendly: {
    description:
      '강남역 앞 바른치과의원이에요. 임플란트와 교정을 주로 보고, 처음 오신 분께는 치료 과정을 쉽게 설명해 드려요. 평일 저녁에도 진료해요.',
    topics: ['임플란트', '교정', '스케일링', '야간 진료'],
  },
  expert: {
    description:
      '바른치과의원은 임플란트 식립과 교정 치료를 전문 분야로 하며, 진단 결과에 따른 단계별 치료 계획을 제공합니다. 강남역 인근에 있으며 평일 야간 진료를 운영합니다.',
    topics: ['임플란트 식립', '교정 치료', '정밀 진단', '치주 치료', '야간 진료'],
  },
}

/** 페이지 검색 문구 — 서버는 그 페이지 이름 · 섹션 제목으로 만든다. 미리보기는 늘 같은 예시 */
const PAGE_SEO: AssistResults['page_seo'] = {
  seo_title: '임플란트 안내 | 바른치과의원',
  seo_description:
    '바른치과의원의 임플란트 진료 과정을 안내합니다. 상담부터 식립, 사후 관리까지 단계별로 확인하세요.',
}

/** 게시판 구성 — 목적 문장의 낱말로 예시 하나를 고른다 (서버는 목적 · 업종 · 있는 게시판을 함께 본다) */
const BOARDS: { words: string[]; result: AssistResults['board'] }[] = [
  {
    words: ['후기', '리뷰'],
    result: {
      board_type: 'REVIEW',
      name: '치료 후기',
      description: '진료를 받은 분들의 후기를 모읍니다.',
      fields: [
        {
          label: '받은 진료',
          field_type: 'SELECT',
          choices: ['임플란트', '교정', '스케일링', '충치 치료'],
        },
        { label: '방문 시기', field_type: 'DATE', choices: [] },
      ],
      categories: ['임플란트', '교정', '일반 진료'],
      permissions: { read: 'PUBLIC', write: 'MEMBER' },
      operation: { allow_secret: false, notify_new_post: true, allow_guest: false },
      reason: '후기는 회원만 쓰게 해 광고 · 도배 글을 줄이고, 새 후기는 알림으로 바로 확인해요.',
    },
  },
  {
    words: ['자주', '질문', 'faq'],
    result: {
      board_type: 'FAQ',
      name: '자주 묻는 질문',
      description: '예약 · 진료 · 비용에 대해 자주 받는 질문을 정리합니다.',
      fields: [],
      categories: ['예약', '진료', '비용', '주차 · 위치'],
      permissions: { read: 'PUBLIC', write: 'ADMIN' },
      operation: { allow_secret: false, notify_new_post: false, allow_guest: false },
      reason: '답은 관리자가 쓰는 글이라 누구나 읽기 · 관리자 글쓰기로 충분해요.',
    },
  },
  {
    words: ['채용', '구인', '모집'],
    result: {
      board_type: 'CARD',
      name: '채용 공고',
      description: '함께 일할 분을 찾는 공고를 올립니다.',
      fields: [
        { label: '모집 직무', field_type: 'TEXT', choices: [] },
        { label: '고용 형태', field_type: 'SELECT', choices: ['정규직', '계약직', '파트타임'] },
        { label: '마감일', field_type: 'DATE', choices: [] },
        { label: '지원 링크', field_type: 'URL', choices: [] },
      ],
      categories: ['진료', '데스크 · 상담', '경영 지원'],
      permissions: { read: 'PUBLIC', write: 'ADMIN' },
      operation: { allow_secret: false, notify_new_post: false, allow_guest: false },
      reason: '공고는 관리자만 올리고, 지원은 링크나 온라인 상담으로 받아요.',
    },
  },
]

const NEWS: AssistResults['board'] = {
  board_type: 'LIST',
  name: '병원 소식',
  description: '진료 시간 변경 · 휴진 · 새 소식을 알립니다.',
  fields: [{ label: '적용 기간', field_type: 'TEXT', choices: [] }],
  categories: ['공지', '휴진 안내', '이벤트'],
  permissions: { read: 'PUBLIC', write: 'ADMIN' },
  operation: { allow_secret: false, notify_new_post: false, allow_guest: false },
  reason: '알림 글은 관리자만 쓰고 누구나 읽게 하는 것이 기본이에요.',
}

const suggestBoard = (purpose: string) => {
  const text = purpose.toLowerCase()
  return BOARDS.find((board) => board.words.some((word) => text.includes(word)))?.result ?? NEWS
}

/** 글 초안 — 서버는 게시판 유형으로 FAQ 를 가린다. 미리보기는 메모가 묻는 말이면 FAQ 예시 */
const NOTICE: AssistResults['post'] = {
  titles: ['추석 연휴 휴진 안내', '추석 연휴 진료 일정을 알려 드려요', '[공지] 9월 추석 연휴 휴진'],
  body: [
    {
      type: 'p',
      text: '추석 연휴 동안 아래와 같이 휴진합니다. 진료 일정에 참고해 주세요.',
    },
    { type: 'ul', items: ['휴진: 9월 14일(월) ~ 9월 18일(금)', '정상 진료: 9월 19일(토)부터'] },
    {
      type: 'p',
      text: '연휴 중 급한 문의는 카카오톡 채널로 남겨 주세요.\n확인하는 대로 답변 드리겠습니다.',
    },
  ],
}

const FAQ: AssistResults['post'] = {
  titles: ['주차할 수 있나요?'],
  body: [
    { type: 'p', text: '네, 건물 지하 주차장을 이용하실 수 있어요.' },
    {
      type: 'ul',
      items: ['진료 받으신 분은 2시간 무료', '접수 데스크에서 차량 번호를 알려 주세요'],
    },
  ],
}

const draftPost = (memo: string) => (/[?？]|질문|묻|나요|까요/.test(memo) ? FAQ : NOTICE)

/** 약관 요약 — 서버는 바뀐 줄만 보고 만든다. 미리보기는 늘 같은 예시 */
const POLICY_SUMMARY: AssistResults['policy_summary'] = {
  summary: '개인정보 보관 기간 조항을 고쳤습니다.\n바뀐 내용은 시행일부터 적용됩니다.',
}

const CONTENT_POLISH: AssistResults['content_polish'] = {
  summary: '건물 지하 주차장을 진료 시간 동안 2시간 무료로 쓰실 수 있어요.',
  body: [
    { type: 'p', text: '병원 건물 지하 1~2층 주차장을 이용해 주세요.' },
    { type: 'ul', items: ['진료 시 2시간 무료', '접수대에서 주차 등록'] },
  ],
}
const CONTENT_TAGS: AssistResults['content_tags'] = {
  tags: [
    { name: '주차', existing: true },
    { name: '이용 안내', existing: false },
  ],
}

let used = 3

export async function previewAssist<K extends AssistKind>(
  kind: K,
  input: AssistInputs[K]
): Promise<AssistResponse<K>> {
  await new Promise((resolve) => window.setTimeout(resolve, 600))
  used += 1
  const result = (
    kind === 'board'
      ? suggestBoard((input as AssistInputs['board']).purpose)
      : kind === 'post'
        ? draftPost((input as AssistInputs['post']).memo)
        : kind === 'policy_summary'
          ? POLICY_SUMMARY
          : kind === 'page_seo'
            ? PAGE_SEO
            : kind === 'content_polish'
              ? CONTENT_POLISH
              : kind === 'content_tags'
                ? CONTENT_TAGS
            : (kind === 'seo' ? SEO : GEO)[(input as AssistInputs['seo']).tone]
  ) as AssistResponse<K>['result']
  return { result, usage: { used, limit: 20, remaining: Math.max(20 - used, 0) } }
}
