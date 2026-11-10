// ════════════════════════════════════════════════════════════════
// SUB NAV — 서브 페이지 탭 메뉴의 현재 페이지 표시
// <nav class="sub-nav" data-current="..."> 의 값과 같은 data-key 탭에 aria-current="page"
// ════════════════════════════════════════════════════════════════
document.addEventListener('includes:loaded', () => {
  const nav = document.querySelector('.sub-nav')
  if (!nav) return

  const { current } = nav.dataset
  const currentPath = window.location.pathname.split('/').pop() || ''

  nav.querySelectorAll('.sub-nav__link').forEach((link) => {
    const href = link.getAttribute('href') || ''
    const key = link.dataset.key
    if ((current && key === current) || (currentPath && href.endsWith(currentPath))) {
      link.setAttribute('aria-current', 'page')
    }
  })
})
