// ════════════════════════════════════════════════════════════════
// SERVICE CARDS — 1024px 미만에서만 카드 슬라이드 (Swiper)
// components/sections/service-cards.html
// - 기존 마크업(ul/li) 그대로 사용: wrapperClass / slideClass 를 BEM 클래스로 지정
// - 1024px 이상이 되면 destroy → CSS 그리드로 복귀
// ════════════════════════════════════════════════════════════════
document.addEventListener('includes:loaded', () => {
  const section = document.querySelector('.service-cards')
  if (!section) return

  const viewport = section.querySelector('.service-cards__viewport')
  const mq = window.matchMedia('(max-width: 1023.98px)')
  let swiper = null

  const enable = () => {
    swiper = new window.Swiper(viewport, {
      wrapperClass: 'service-cards__list',
      slideClass: 'service-cards__item',
      slidesPerView: 1.2,
      spaceBetween: 16,
      breakpoints: {
        // 태블릿: 2장 반 정도 보이게
        600: { slidesPerView: 2.3, spaceBetween: 20 },
      },
      pagination: {
        el: section.querySelector('.service-cards__pagination'),
        clickable: true,
      },
      a11y: {
        slideRole: 'listitem', // ul > li 의미 유지
        slideLabelMessage: '{{index}} / {{slidesLength}}',
        paginationBulletMessage: '{{index}}번째 카드로 이동',
      },
    })
  }
  const disable = () => {
    swiper?.destroy(true, true)
    swiper = null
  }

  const sync = () => (mq.matches ? !swiper && enable() : swiper && disable())
  mq.addEventListener('change', sync)
  sync()
})
