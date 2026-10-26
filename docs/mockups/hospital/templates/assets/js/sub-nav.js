// ════════════════════════════════════════════════════════════════
// SUB NAV — 서브 페이지 탭 메뉴의 현재 페이지 표시
// <nav class="sub-nav" data-current="about"> 의 값과 같은 data-key 탭에 aria-current="page"
// ════════════════════════════════════════════════════════════════
document.addEventListener('includes:loaded', () => {
  const nav = document.querySelector('.sub-nav')
  if (!nav) return

  const { current } = nav.dataset
  nav.querySelectorAll('.sub-nav__link').forEach((link) => {
    if (link.dataset.key === current) link.setAttribute('aria-current', 'page')
  })
})
