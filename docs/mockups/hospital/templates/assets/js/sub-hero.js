document.addEventListener('includes:loaded', () => {
  document.querySelectorAll('.sub-hero').forEach((hero) => {
    const button = hero.querySelector('.sub-hero__scroll')
    const target = hero.nextElementSibling
    if (!button || !target) return

    button.addEventListener('click', () => {
      const headerHeight = document.querySelector('.gnb')?.getBoundingClientRect().height || 0
      const top = window.scrollY + target.getBoundingClientRect().top - headerHeight
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      window.scrollTo({ top, behavior: reducedMotion ? 'instant' : 'smooth' })
      target.querySelector('a, button, [tabindex="0"]')?.focus({ preventScroll: true })
    })
  })
})
