document.addEventListener('includes:loaded', () => {
  document.querySelectorAll('.sub-hero:not(.sub-hero--plain)').forEach((hero) => {
    const button = hero.querySelector('.sub-hero__scroll')
    const target = hero.nextElementSibling
    if (!button || !target) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const scrollKeys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']
    let timer = 0
    let frame = 0

    const cancel = () => {
      window.clearTimeout(timer)
      window.cancelAnimationFrame(frame)
      window.removeEventListener('wheel', cancel)
      window.removeEventListener('touchstart', cancel)
      window.removeEventListener('pointerdown', cancel)
      window.removeEventListener('keydown', onKeydown)
      window.removeEventListener('pagehide', cancel)
      window.removeEventListener('load', startIntro)
    }
    const onKeydown = (event) => {
      if (scrollKeys.includes(event.key)) cancel()
    }

    const scrollToContent = () => {
      cancel()
      const headerHeight = document.querySelector('#header')?.getBoundingClientRect().height || 0
      const top = window.scrollY + target.getBoundingClientRect().top - headerHeight
      if (reducedMotion.matches) {
        window.scrollTo({ top, behavior: 'instant' })
        return
      }

      const startY = window.scrollY
      const startTime = performance.now()
      const step = (now) => {
        const progress = Math.min((now - startTime) / 900, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        window.scrollTo({ top: startY + (top - startY) * eased, behavior: 'instant' })
        if (progress < 1) frame = window.requestAnimationFrame(step)
        else cancel()
      }
      listenForInteraction()
      frame = window.requestAnimationFrame(step)
    }

    const listenForInteraction = () => {
      window.addEventListener('wheel', cancel, { passive: true })
      window.addEventListener('touchstart', cancel, { passive: true })
      window.addEventListener('pointerdown', cancel, { passive: true })
      window.addEventListener('keydown', onKeydown)
      window.addEventListener('pagehide', cancel, { once: true })
    }

    button.addEventListener('click', () => {
      scrollToContent()
      target.querySelector('a, button, [tabindex="0"]')?.focus({ preventScroll: true })
    })

    // 이미지 로딩 완료 시점에 맞춰 비주얼을 잠깐 보여준 뒤 본문으로 이동한다.
    const startIntro = () => {
      if (window.scrollY > 16) return
      timer = window.setTimeout(scrollToContent, reducedMotion.matches ? 0 : 650)
    }

    // 깊은 링크와 뒤로 가기의 기존 스크롤 위치는 유지한다.
    const navigation = performance.getEntriesByType('navigation')[0]
    if (location.hash || navigation?.type === 'back_forward' || window.scrollY > 16) return

    listenForInteraction()
    if (document.readyState === 'complete') startIntro()
    else window.addEventListener('load', startIntro, { once: true })
  })
})
