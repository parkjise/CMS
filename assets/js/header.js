// ════════════════════════════════════════════════════════════════
// HEADER — 메인·서브 페이지 공통
// - 스크롤 시 .header--scrolled
// - 모바일·태블릿(1024px 미만) 메뉴 토글 (aria-expanded 동기화, 링크 클릭·Esc 로 닫힘)
// ════════════════════════════════════════════════════════════════
document.addEventListener('includes:loaded', () => {
  const header = document.getElementById('header')
  if (!header) return

  const onScroll = () => header.classList.toggle('header--scrolled', window.scrollY > 16)
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })

  const toggle = header.querySelector('.header__menu-toggle')
  const nav = header.querySelector('.header__nav')
  const icon = toggle.querySelector('i')
  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open))
    toggle.setAttribute('aria-label', open ? '전체 메뉴 닫기' : '전체 메뉴 열기')
    icon.className = open ? 'ri-close-line' : 'ri-menu-line'
    nav.classList.toggle('header__nav--open', open)
  }
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'))

  // 메뉴 링크 이동 · Esc · 데스크톱 폭으로 전환 시 닫기
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false)
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('header__nav--open')) {
      setOpen(false)
      toggle.focus()
    }
  })
  window.matchMedia('(min-width: 1024px)').addEventListener('change', (e) => {
    if (e.matches) setOpen(false)
  })
})
