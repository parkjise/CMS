document.addEventListener('includes:loaded', () => {
  const slider = document.querySelector('.hero-slider__viewport')

  if (!slider) return

  const current = slider.querySelector('.hero-slider__progress-current')
  const total = slider.querySelector('.hero-slider__progress-total')
  const fill = slider.querySelector('.hero-slider__progress-fill')
  const contentPanels = [...slider.querySelectorAll('.hero-slider__content')]

  // loop 초기화 전에 실제 슬라이드 개수 계산
  const slideCount = slider.querySelectorAll('.swiper-wrapper > .swiper-slide').length

  const updateNumbers = (swiper) => {
    if (current) current.textContent = String(swiper.realIndex + 1)
    if (total) total.textContent = String(slideCount)
    contentPanels.forEach((panel, index) => {
      panel.hidden = index !== swiper.realIndex
    })
  }

  const contentSelectors = [
    '.hero-slider__title',
    '.hero-slider__copy-line--primary',
    '.hero-slider__copy-line--secondary',
  ]
  const contentElements = slider.querySelectorAll(contentSelectors.join(', '))

  const resetContent = () => {
    window.gsap.killTweensOf(contentElements)
    window.gsap.set(contentElements, { y: 30, autoAlpha: 0 })
  }

  const animateContent = (swiper) => {
    const panel = contentPanels[swiper.realIndex]
    if (!panel) return

    const elements = contentSelectors
      .map((selector) => panel.querySelector(selector))
      .filter(Boolean)
    if (!elements.length) return

    window.gsap.fromTo(
      elements,
      { y: 30, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: 0.6, stagger: 0.6, ease: 'power2.out', overwrite: true }
    )
  }

  const swiper = new window.Swiper(slider, {
    slidesPerView: 1,
    loop: true,
    speed: 600,

    autoplay: {
      delay: 5000, // 6초마다 전환
      disableOnInteraction: false, // 직접 넘긴 후에도 자동 재생 유지
      pauseOnMouseEnter: true, // 마우스를 올리면 일시 정지
    },

    pagination: {
      el: slider.querySelector('.hero-slider__bullets'),
      clickable: true,
    },

    navigation: {
      prevEl: slider.querySelector('.hero-slider__button--prev'),
      nextEl: slider.querySelector('.hero-slider__button--next'),
    },

    on: {
      init(swiper) {
        updateNumbers(swiper)
        resetContent()
        animateContent(swiper)
      },
      slideChange: updateNumbers,
      slideChangeTransitionStart: resetContent,
      slideChangeTransitionEnd: animateContent,
      autoplayTimeLeft(swiper, timeLeft, remainingRatio) {
        if (!fill) return
        fill.style.transform = `scaleX(${1 - remainingRatio})`
      },
    },
  })

  // play ,stop
  const autoplayButton = slider.querySelector('.hero-slider__button--autoplay')
  if (!autoplayButton) return

  const updateAutoplayButton = () => {
    const running = swiper.autoplay.running
    const label = running ? '자동 재생 정지' : '자동 재생 시작'
    autoplayButton.setAttribute('aria-label', label)
    autoplayButton.title = label
    autoplayButton.querySelector('i').className = running ? 'ri-pause-line' : 'ri-play-line'
  }

  autoplayButton.addEventListener('click', () => {
    if (swiper.autoplay.running) {
      swiper.autoplay.stop()
    } else {
      swiper.autoplay.start()
    }
  })

  swiper.on('autoplayStart', updateAutoplayButton)
  swiper.on('autoplayStop', updateAutoplayButton)
  updateAutoplayButton()
})
