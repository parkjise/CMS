import {
  BarChart3,
  ClipboardList,
  CreditCard,
  FileText,
  Layers,
  LayoutDashboard,
  MessageSquare,
  ScrollText,
  Search,
  Share2,
  Sparkles,
} from 'lucide-react'

export const ADMIN_NAVIGATION = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: '대시보드' },
  { to: '/admin/content', icon: FileText, label: '콘텐츠 편집' },
  { to: '/admin/sns', icon: Share2, label: 'SNS 설정' },
  {
    to: '/admin/boards',
    icon: ClipboardList,
    label: '게시판 관리',
    children: [
      { to: '/admin/boards', label: '게시판 목록' },
      { to: '/admin/boards/new', label: '게시판 만들기' },
      { to: '/admin/boards/design', label: '게시판 디자인' },
      { to: '/admin/boards/fields', label: '필드 관리' },
      { to: '/admin/posts', label: '게시글 관리' },
      { to: '/admin/boards/categories', label: '카테고리 관리' },
      { to: '/admin/boards/permissions', label: '권한 관리' },
      { to: '/admin/boards/trash', label: '휴지통' },
      { to: '/admin/boards/settings', label: '환경설정' },
      { to: '/admin/posts/reports', label: '신고된 글' },
      { to: '/admin/boards/history', label: '변경 기록' },
    ],
  },
  { to: '/admin/inquiries', icon: MessageSquare, label: '문의 관리' },
  { to: '/admin/seo', icon: Search, label: 'SEO 설정' },
  { to: '/admin/policies', icon: ScrollText, label: '약관 · 방침' },
  { to: '/admin/templates', icon: Layers, label: '템플릿' },
  { to: '/admin/analytics', icon: BarChart3, label: '방문자 분석' },
  { to: '/admin/reports', icon: Sparkles, label: '월간 리포트' },
  { to: '/admin/billing', icon: CreditCard, label: '요금제' },
]

const matches = (pathname: string, to: string) => pathname === to || pathname.startsWith(`${to}/`)

/** 2뎁스 현재 화면 — 더 구체적인 형제 메뉴가 있으면 그쪽만 (목록과 생성이 함께 켜지지 않게) */
export function isChildActive(pathname: string, to: string, siblings: { to: string }[]) {
  // 게시판별 화면은 그 화면을 여는 하위 메뉴를 켠다 (T-187) — 글은 게시글 관리, 연결 · 운영은 환경설정
  const detail = pathname.match(
    /^\/admin\/boards\/[^/]+\/(design|fields|categories|permissions|operation|settings|connection|posts)(?:\/.*)?$/
  )
  if (detail) {
    const section = detail[1]
    const target =
      section === 'posts'
        ? '/admin/posts'
        : section === 'connection' || section === 'operation'
          ? '/admin/boards/settings'
          : `/admin/boards/${section}`
    if (siblings.some((item) => item.to === target)) return to === target
  }
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
    } else if (base.to === '/admin/content') crumbs.push({ label: '섹션 편집' })
  }
  return crumbs
}
