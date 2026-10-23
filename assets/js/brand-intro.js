document.addEventListener('includes:loaded', () => {
  const slider = document.querySelector('.brand-intro__gallery-viewport')
  if (!slider) return

  const section = document.querySelector('.brand-intro')

  const slides = [...slider.querySelectorAll('.brand-intro__gallery-slide')]
  slides.forEach((slide, index) => {
    slide.setAttribute('aria-label', `${slides.length}개 중 ${index + 1}번째 이미지`)
  })
  // Keep images available on both sides while the three designs circulate.
  slides.forEach((slide) => slide.parentElement.append(slide.cloneNode(true)))

  const updateCards = (swiper) => {
    swiper.slides.forEach((slide) => {
      const progress = Math.max(-1, Math.min(1, slide.progress || 0))
      const distance = Math.abs(progress)
      const card = slide.querySelector('.brand-intro__gallery-card')
      card.style.transform = `translateY(${distance * 158}px) scale(${1 - distance * 0.25}) rotate(${-progress * 44}deg)`
      card.style.opacity = String(1 - distance * 0.7)
    })
  }

  new window.Swiper(slider, {
    initialSlide: 1,
    slidesPerView: 1,
    centeredSlides: true,
    spaceBetween: '25%',
    watchSlidesProgress: true,
    loop: true,
    loopAdditionalSlides: 1,
    speed: 700,
    grabCursor: true,
    autoplay: {
      delay: 3000, // 6초마다 전환
      disableOnInteraction: false, // 직접 넘긴 후에도 자동 재생 유지
      pauseOnMouseEnter: true, // 마우스를 올리면 일시 정지
    },
    effect: 'slide',
    on: {
      init: updateCards,
      setTranslate: updateCards,
      setTransition(swiper, duration) {
        swiper.slides.forEach((slide) => {
          slide.querySelector('.brand-intro__gallery-card').style.transitionDuration = `${duration}ms`
        })
      },
    },
    navigation: {
      prevEl: section.querySelector('.brand-intro__gallery-prev'),
      nextEl: section.querySelector('.brand-intro__gallery-next'),
    },
    a11y: {
      prevSlideMessage: '이전 이미지',
      nextSlideMessage: '다음 이미지',
      slideLabelMessage: null,
    },
  })

  window.gsap.registerPlugin(window.ScrollTrigger)

  window.gsap.fromTo(
    section,
    {
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
    },
    {
      borderTopLeftRadius: 120,
      borderTopRightRadius: 120,
      duration: 0.8,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: section,
        start: 'top 90%',
        end: 'top 40%',
        toggleActions: 'play reverse play reverse',
      },
    }
  )
})
