document.addEventListener('includes:loaded', () => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  window.gsap.registerPlugin(window.ScrollTrigger)

  const selectors = [
    '.brand-intro__title',
    '.brand-intro__desc',
    '.brand-intro__gallery',
    '.brand-intro__signature-title',
    '.brand-intro__signature-desc',
    '.brand-intro__feature',
    '.service-cards .section-head > *',
    '.service-cards__item',
    '.video-playlist .section-head > *',
    '.video-playlist__featured',
    '.video-playlist__item',
    '.notice__head > *',
    '.notice__item',
    // 서브: 사업 소개
    '.page-intro .section-head > *',
    '.story-text__title',
    '.story-text__desc',
    '.split-story__media',
    '.milestone-split__media',
    '.milestone-split__item',
    '.criteria-cards__item',
    '.value-circles__item',
    '.value-circles__more',
  ]

  document.querySelectorAll(selectors.join(', ')).forEach((element) => {
    window.gsap.fromTo(
      element,
      { y: 36, autoAlpha: 0 },
      {
        y: 0,
        autoAlpha: 1,
        duration: 1,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: element,
          start: 'top 88%',
          once: true,
        },
      }
    )
  })
})
