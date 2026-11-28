import {
  BarChart3,
  ClipboardList,
  CreditCard,
  FileText,
  Globe,
  Layers,
  LayoutDashboard,
  Library,
  MessageSquare,
  Share2,
  Sparkles,
} from 'lucide-react'

/** 신고된 글 — 메뉴에 처리 안 한 신고 수를 보인다 (T-229) */
export const REPORTS_PATH = '/admin/posts/reports'

/** 낯선 검색 용어를 한 줄로 (T-230) — 메뉴 툴팁 · 화면 제목 아래에 같은 말 */
export const SITE_HINTS = {
  seo: '검색엔진에 보이는 제목 · 설명',
  aeo: '자주 묻는 질문을 답변 형식으로',
  geo: 'AI 답변 서비스에 브랜드 소개',
} as const

/** 사이트 공통 설정 (T-221, 사이트 관리 기획서) — 첫 화면은 기본정보 */
export const SITE_HOME = '/admin/site/info'

export const ADMIN_NAVIGATION = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: '대시보드' },
  {
    to: '/admin/site',
    icon: Globe,
    label: '사이트 관리',
    children: [
      { to: SITE_HOME, label: '사이트 기본정보' },
      { to: '/admin/site/menu', label: '메뉴 관리' },
      { to: '/admin/site/policies', label: '약관 · 정책 관리' },
      { to: '/admin/site/seo', label: 'SEO 설정', hint: SITE_HINTS.seo },
      { to: '/admin/site/aeo', label: 'AEO 설정', hint: SITE_HINTS.aeo },
      { to: '/admin/site/geo', label: 'GEO 설정', hint: SITE_HINTS.geo },
    ],
  },
  { to: '/admin/pages', icon: FileText, label: '페이지 관리' },
  {
    to: '/admin/contents',
    icon: Library,
    label: '콘텐츠 관리',
    // 독립 콘텐츠 관리 (T-255, 콘텐츠 관리 기획서 3장) — 목록 · 작성(T-256) · 카테고리 · 태그(T-257)
    children: [
      { to: '/admin/contents', label: '콘텐츠 목록' },
      { to: '/admin/contents/new', label: '콘텐츠 작성' },
      { to: '/admin/contents/types', label: '콘텐츠 유형' },
    ],
  },
  { to: '/admin/sns', icon: Share2, label: 'SNS 설정' },
  {
    to: '/admin/boards',
    icon: ClipboardList,
    label: '게시판 관리',
    // 11 → 6 (T-229, 2026-11-23 사용자 결정) — 디자인 · 필드 · 카테고리 · 권한 · 설정은
    // 게시판을 고른 뒤 탭으로. 예전 주소(/admin/boards/design 등)는 마지막 게시판으로 그대로 열린다
    children: [
      { to: '/admin/boards', label: '게시판 목록' },
      { to: '/admin/boards/new', label: '게시판 만들기' },
      { to: '/admin/posts', label: '게시글 관리' },
      { to: REPORTS_PATH, label: '신고된 글' },
      { to: '/admin/boards/trash', label: '휴지통' },
      { to: '/admin/boards/history', label: '변경 기록' },
    ],
  },
  { to: '/admin/inquiries', icon: MessageSquare, label: '문의 관리' },
  { to: '/admin/templates', icon: Layers, label: '템플릿' },
  { to: '/admin/analytics', icon: BarChart3, label: '방문자 분석' },
  { to: '/admin/reports', icon: Sparkles, label: '월간 리포트' },
  { to: '/admin/billing', icon: CreditCard, label: '요금제' },
]

const matches = (pathname: string, to: string) => pathname === to || pathname.startsWith(`${to}/`)

/** 2뎁스 현재 화면 — 더 구체적인 형제 메뉴가 있으면 그쪽만 (목록과 생성이 함께 켜지지 않게) */
export function isChildActive(pathname: string, to: string, siblings: { to: string }[]) {
  // 게시판별 화면 — 글은 게시글 관리, 나머지 탭(필드 · 디자인 · 설정)은 게시판 목록 (T-187 → T-229)
  const boardPosts = /^\/admin\/boards\/[^/]+\/posts(?:\/.*)?$/.test(pathname)
  if (boardPosts && siblings.some((item) => item.to === '/admin/posts'))
    return to === '/admin/posts'
  return (
    matches(pathname, to) &&
    !siblings.some((other) => other.to.startsWith(`${to}/`) && matches(pathname, other.to))
  )
}

export function breadcrumbsFor(pathname: string) {
  const base = ADMIN_NAVIGATION.find(({ to }) => pathname === to || pathname.startsWith(`${to}/`))
  if (pathname === '/admin/posts')
    return [{ label: '게시판 관리', to: '/admin/boards' }, { label: '게시글 관리' }]
  if (pathname === '/admin/posts/reports')
    return [{ label: '게시판 관리', to: '/admin/boards' }, { label: '신고된 글' }]
  if (!base) return [{ label: pathname === '/admin/403' ? '접근 권한 안내' : '관리자' }]
  const crumbs: { label: string; to?: string }[] = [{ label: base.label, to: base.to }]
  if (pathname !== base.to) {
    const tail = pathname.slice(base.to.length)
    if (base.to === '/admin/boards') {
      const entry = base.children?.find((item) => item.to === pathname)
      if (entry) crumbs.push({ label: entry.label })
      else if (tail === '/new') crumbs.push({ label: '게시판 추가' })
      else if (tail === '/trash') crumbs.push({ label: '휴지통' })
      else if (tail === '/history') crumbs.push({ label: '변경 기록' })
      else if (tail.endsWith('/settings')) crumbs.push({ label: '게시판 설정' })
      else if (tail.endsWith('/connection')) crumbs.push({ label: '홈페이지 연결' })
      else if (tail.endsWith('/fields')) crumbs.push({ label: '필드 관리' })
      else if (tail.endsWith('/design')) crumbs.push({ label: '게시판 디자인' })
      else if (tail.endsWith('/categories')) crumbs.push({ label: '카테고리 관리' })
      else if (tail.endsWith('/permissions')) crumbs.push({ label: '게시판 권한' })
      else if (tail.endsWith('/operation')) crumbs.push({ label: '운영 설정' })
      else {
        const boardPath = pathname.split('/posts')[0]
        crumbs.push({ label: '게시글 목록', to: `${boardPath}/posts` })
        if (tail.endsWith('/new')) crumbs.push({ label: '글쓰기' })
        else if (tail.endsWith('/edit')) crumbs.push({ label: '게시글 수정' })
      }
    } else if (base.to === '/admin/site') {
      const entry = base.children?.find((item) => item.to === pathname)
      if (entry) crumbs.push({ label: entry.label })
    } else if (base.to === '/admin/pages') {
      // 페이지 이름은 화면 제목에 — 경로는 '페이지 편집 / 섹션 편집' 만 (T-238)
      crumbs.push(
        tail.includes('/sections/')
          ? { label: '페이지 편집', to: pathname.split('/sections/')[0] }
          : { label: '페이지 편집' }
      )
      if (tail.includes('/sections/')) crumbs.push({ label: '섹션 편집' })
    }
  }
  return crumbs
}
