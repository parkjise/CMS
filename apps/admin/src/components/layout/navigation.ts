import {
  BarChart3,
  ClipboardList,
  CreditCard,
  FileText,
  Layers,
  LayoutDashboard,
  MessageSquare,
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
      { to: '/admin/posts', label: '전체 글' },
    ],
  },
  { to: '/admin/inquiries', icon: MessageSquare, label: '문의 관리' },
  { to: '/admin/seo', icon: Search, label: 'SEO 설정' },
  { to: '/admin/templates', icon: Layers, label: '템플릿' },
  { to: '/admin/analytics', icon: BarChart3, label: '방문자 분석' },
  { to: '/admin/reports', icon: Sparkles, label: '월간 리포트' },
  { to: '/admin/billing', icon: CreditCard, label: '요금제' },
]

export function breadcrumbsFor(pathname: string) {
  const base = ADMIN_NAVIGATION.find(({ to }) => pathname === to || pathname.startsWith(`${to}/`))
  if (pathname === '/admin/posts')
    return [{ label: '게시판 관리', to: '/admin/boards' }, { label: '전체 글' }]
  if (!base) return [{ label: pathname === '/admin/403' ? '접근 권한 안내' : '관리자' }]
  const crumbs: { label: string; to?: string }[] = [{ label: base.label, to: base.to }]
  if (pathname !== base.to) {
    const tail = pathname.slice(base.to.length)
    if (base.to === '/admin/boards') {
      if (tail === '/new') crumbs.push({ label: '게시판 추가' })
      else if (tail === '/trash') crumbs.push({ label: '휴지통' })
      else if (tail.endsWith('/settings')) crumbs.push({ label: '게시판 설정' })
      else if (tail.endsWith('/connection')) crumbs.push({ label: '홈페이지 연결' })
      else if (tail.endsWith('/fields')) crumbs.push({ label: '필드 관리' })
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
