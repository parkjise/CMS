// include.js 가 components/*.html 을 모두 불러온 뒤 실행
document.addEventListener('includes:loaded', () => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  // [GSAP Hero Sequential Intro Animation]
  const initHeroAnimation = () => {
    const gsap = window.gsap
    const hero = document.querySelector('.hero-slider')
    if (!hero || !gsap) return

    const chars = hero.querySelectorAll('.flip-char')
    const tools = hero.querySelector('.hero-slider__tools')
    const toolImgs = tools ? tools.querySelectorAll('img') : []
    const desc = hero.querySelector('.hero-slider__description')
    const buttons = hero.querySelectorAll('.hero-slider__actions .btn')
    const scrollDown = hero.querySelector('.hero-slider__scroll-wrap')

    if (reducedMotion.matches) {
      if (tools) gsap.set(tools, { scaleX: 1, opacity: 1 })
      if (desc) gsap.set(desc, { opacity: 1, y: 0 })
      if (buttons.length) gsap.set(buttons, { opacity: 1, y: 0 })
      if (scrollDown) gsap.set(scrollDown, { opacity: 1, y: 0 })
      return
    }

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })

    // 1. Hero text Flip-X Effect (글자별 3D 플립 회전)
    tl.from(chars, {
      duration: 0.85,
      opacity: 0,
      rotationX: -90,
      y: 40,
      stagger: 0.028,
      ease: 'back.out(1.8)',
    })

    // 2. 텍스트 효과 후 오른쪽 파랑색 바(tools) 가운데 기준 가로 크기 0 -> 정상 크기 확장
    if (tools) {
      tl.from(
        tools,
        {
          duration: 0.7,
          scaleX: 0,
          transformOrigin: '50% 50%',
          opacity: 0,
          ease: 'power4.out',
          immediateRender: true,
        },
        '-=0.25'
      )
    }

    // 3. 파랑색 바 내부 아이콘 이미지들(tool-1, 2, 3) 순차 팝업 등장
    if (toolImgs.length) {
      tl.from(
        toolImgs,
        {
          duration: 0.6,
          scale: 0,
          opacity: 0,
          y: 20,
          stagger: 0.12,
          ease: 'back.out(2)',
          immediateRender: true,
        },
        '-=0.35'
      )
    }

    // 4. slider__description 페이드 & 슬라이드업 등장
    if (desc) {
      tl.from(
        desc,
        {
          duration: 0.75,
          opacity: 0,
          y: 24,
          immediateRender: true,
        },
        '-=0.2'
      )
    }

    // 5. 버튼 차례대로 스태거 등장
    if (buttons.length) {
      tl.from(
        buttons,
        {
          duration: 0.65,
          opacity: 0,
          y: 12,
          scale: 0.98,
          stagger: 0.12,
          ease: 'back.out(1.5)',
          immediateRender: true,
          clearProps: 'transform,opacity',
        },
        '-=0.3'
      )
    }

    // (보너스) 스크롤 다운 가이드 은은하게 등장
    if (scrollDown) {
      tl.from(
        scrollDown,
        {
          duration: 0.6,
          opacity: 0,
          y: 15,
          immediateRender: true,
        },
        '-=0.2'
      )
    }
  }

  initHeroAnimation()

  // [고객사 무한 롤링 마퀴 (KonaBizCard style)]
  const initCustomersMarquee = () => {
    const banners = document.querySelectorAll('.customers_item-wrapper')
    banners.forEach((bannerWrapper, index) => {
      // 무한 루프를 위해 DOM 복제
      bannerWrapper.innerHTML += bannerWrapper.innerHTML
      bannerWrapper.classList.add('track')
      if ((index + 1) % 2 === 0) {
        bannerWrapper.classList.add('reverse')
      }
    })
  }

  initCustomersMarquee()

  // [Brand Intro Rating Icon GSAP 부드러운 바운스/유영 애니메이션]
  const initRatingIconBounce = () => {
    const gsap = window.gsap
    const ratingIcon = document.querySelector('.brand-intro__rating-icon')
    if (!ratingIcon || !gsap || reducedMotion.matches) return

    gsap.to(ratingIcon, {
      y: -15,
      rotation: 3,
      duration: 1.1,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
      transformOrigin: '50% 50%',
    })
  }

  initRatingIconBounce()

  // [멀티링크 공유 버튼 링크 복사] components/sections/multilink.html
  const initMultilinkShare = () => {
    const shareBtn = document.querySelector('#btnMultilinkShare')
    const tooltip = document.querySelector('#multilinkShareTooltip')
    if (!shareBtn) return

    shareBtn.addEventListener('click', async () => {
      const shareUrl = window.location.href
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(shareUrl)
        }
      } catch (err) {
        console.error('Clipboard copy failed', err)
      }

      if (tooltip) {
        tooltip.classList.add('is-visible')
        setTimeout(() => tooltip.classList.remove('is-visible'), 2200)
      }
    })
  }

  initMultilinkShare()

  // [헤더 / 모바일 메뉴] components/header.html
  const header = document.querySelector('.header')
  const menu = header?.querySelector('.header__nav')
  const toggle = header?.querySelector('.header__menu-toggle')
  const closeMenu = () => {
    menu?.classList.remove('header__nav--open')
    toggle?.setAttribute('aria-expanded', 'false')
    toggle?.setAttribute('aria-label', 'Open menu')
  }

  toggle?.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true'
    menu?.classList.toggle('header__nav--open', open)
    toggle.setAttribute('aria-expanded', String(open))
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu')
  })
  menu?.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeMenu()
  })
  document.addEventListener('click', (event) => {
    if (header && !header.contains(event.target)) closeMenu()
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && toggle?.getAttribute('aria-expanded') === 'true') {
      closeMenu()
      toggle?.focus()
    }
  })
  window.matchMedia('(min-width: 1024px)').addEventListener('change', closeMenu)

  // [스크롤 등장 애니메이션] 전체 섹션 공통 - [data-reveal] 요소
  if (!reducedMotion.matches && 'IntersectionObserver' in window) {
    document.body.classList.add('has-motion')
    const reveal = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.classList.add('is-visible')
          reveal.unobserve(entry.target)
        })
      },
      { threshold: 0.08 }
    )
    document.querySelectorAll('[data-reveal]').forEach((element) => reveal.observe(element))
  }

  // [메뉴 활성화 표시] components/header.html 메뉴 ↔ 각 섹션 id
  if (menu) {
    const navigation = [...menu.querySelectorAll('a')]
    const activeSections = new Map()
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => activeSections.set(entry.target.id, entry.isIntersecting))
        const active = navigation.find((link) => activeSections.get(link.hash.slice(1)))
        if (active) navigation.forEach((link) => link.classList.toggle('is-active', link === active))
      },
      { rootMargin: '-20% 0px -45% 0px' }
    )
    navigation.forEach((link) => {
      try {
        if (link.hash && link.hash !== '#') {
          const section = document.querySelector(link.hash)
          if (section) sectionObserver.observe(section)
        }
      } catch (e) {}
    })
  }

  // [프로젝트 상세 팝업] 트리거: components/sections/project-grid.html / 팝업: index.html .project-dialog
  const dialog = document.querySelector('.project-dialog')
  let projectTrigger = null
  if (dialog) {
    document.querySelectorAll('[data-project]').forEach((button) => {
      button.addEventListener('click', () => {
        projectTrigger = button
        const project = button.closest('.project-grid__item')
        const image = button.querySelector('img')
        const dialogImg = dialog.querySelector('img')
        if (dialogImg && image) {
          dialogImg.src = image.src
          dialogImg.alt = image.alt
        }
        const dialogTitle = dialog.querySelector('h2')
        if (dialogTitle && project) {
          dialogTitle.textContent =
            project.querySelector('h3')?.innerText.replace(/\n/g, ' ') || ''
        }
        const dialogDesc = dialog.querySelector('.project-dialog__description')
        if (dialogDesc && project) {
          dialogDesc.textContent =
            project.querySelector('.project-grid__content p')?.textContent || ''
        }
        dialog.showModal()
        document.body.style.overflow = 'hidden'
      })
    })
    dialog.querySelector('button')?.addEventListener('click', () => dialog.close())
    dialog.addEventListener('click', (event) => {
      const box = dialog.getBoundingClientRect()
      if (
        event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom
      )
        dialog.close()
    })
    dialog.querySelector('a')?.addEventListener('click', () => dialog.close())
    dialog.addEventListener('close', () => {
      document.body.style.overflow = ''
      projectTrigger?.focus({ preventScroll: true })
    })
  }

  // [후기 슬라이드] components/sections/social-proof.html
  const quotes = [...document.querySelectorAll('.testimonials__quote')]
  if (quotes.length > 0) {
    let quoteIndex = 0
    const showQuote = (direction) => {
      quoteIndex = (quoteIndex + direction + quotes.length) % quotes.length
      quotes.forEach((quote, index) => {
        quote.hidden = index !== quoteIndex
      })
    }
    document.querySelector('[data-testimonial-prev]')?.addEventListener('click', () => showQuote(-1))
    document.querySelector('[data-testimonial-next]')?.addEventListener('click', () => showQuote(1))
  }

  // [요금제 월/연 전환] components/sections/pricing.html
  const billingToggle = document.querySelector('#billing-toggle')
  billingToggle?.addEventListener('change', (event) => {
    const annual = event.target.checked
    document.querySelectorAll('[data-monthly]').forEach((price) => {
      const amount = Number(annual ? price.dataset.annually : price.dataset.monthly)
      price.textContent = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(amount)
    })
    document.querySelectorAll('[data-billing-unit]').forEach((unit) => {
      unit.textContent = annual ? '/ year' : '/ month'
    })
  })

  // [문의 폼 / 첨부파일] components/sections/contact.html
  const form = document.querySelector('[data-contact-form]')
  if (form) {
    form.querySelector('[type=file]')?.addEventListener('change', (event) => {
      const label = form.querySelector('[data-file-label]')
      if (label) {
        label.textContent = event.target.files[0]?.name || 'Add an attachment'
      }
    })
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      if (!form.reportValidity()) return
      const status = form.querySelector('[role=status]')
      if (status) {
        status.textContent = 'Thank you! This is a local preview; your message has not been sent.'
      }
    })
  }

  // [도입 문의 모달 제어 및 유효성 검사] components/inquiry-modal.html
  const inquiryDialog = document.querySelector('#inquiry-dialog')
  if (inquiryDialog) {
    let lastActiveTrigger = null

    const openInquiryModal = (e) => {
      if (e) e.preventDefault()
      lastActiveTrigger = document.activeElement
      inquiryDialog.showModal()
      document.body.style.overflow = 'hidden'
      inquiryDialog.querySelector('#inq-org')?.focus()
    }

    const closeInquiryModal = () => {
      inquiryDialog.close()
    }

    // "도입 문의", "프로젝트 문의", "Start a Project", "도입 상담" 등 모든 contact 링크 및 버튼에 모달 바인딩
    document.querySelectorAll('a[href="#contact"], button[data-inquiry-trigger]').forEach((btn) => {
      btn.addEventListener('click', openInquiryModal)
    })

    // 닫기 버튼 및 백드롭 클릭 닫기
    inquiryDialog.querySelector('.inquiry-modal__close')?.addEventListener('click', closeInquiryModal)
    inquiryDialog.addEventListener('click', (event) => {
      const box = inquiryDialog.getBoundingClientRect()
      if (
        event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom
      ) {
        closeInquiryModal()
      }
    })

    inquiryDialog.addEventListener('close', () => {
      document.body.style.overflow = ''
      lastActiveTrigger?.focus?.({ preventScroll: true })
    })

    // 모달 폼 유효성 검증 및 제출 인터랙션
    const inqForm = inquiryDialog.querySelector('#inquiryForm')
    const inqStatus = inquiryDialog.querySelector('.inquiry-form-status')

    inqForm?.addEventListener('submit', (e) => {
      e.preventDefault()
      let isValid = true

      // 필드 목록 검증
      const fields = [
        { id: 'inq-org', validate: (v) => v.trim().length > 0 },
        { id: 'inq-bizno', validate: (v) => /^[0-9-]{10,12}$/.test(v.trim()) },
        { id: 'inq-name', validate: (v) => v.trim().length > 0 },
        { id: 'inq-phone', validate: (v) => /^[0-9-]{9,14}$/.test(v.trim()) },
        { id: 'inq-email', validate: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) },
        { id: 'inq-employees', validate: (v) => Number(v) > 0 },
      ]

      fields.forEach(({ id, validate }) => {
        const input = inqForm.querySelector(`#${id}`)
        const error = input?.closest('.inquiry-form-item')?.querySelector('.inquiry-form-error')
        if (!input) return

        if (!validate(input.value)) {
          isValid = false
          input.classList.add('has-error')
          error?.classList.add('is-visible')
        } else {
          input.classList.remove('has-error')
          error?.classList.remove('is-visible')
        }
      })

      // 개인정보 수집 및 이용 동의 검증
      const agree = inqForm.querySelector('#agree_chk')
      const agreeError = inqForm.querySelector('.agree-error')
      if (agree && !agree.checked) {
        isValid = false
        agreeError?.classList.add('is-visible')
      } else {
        agreeError?.classList.remove('is-visible')
      }

      if (!isValid) return

      // 성공 피드백 표시
      const submitBtn = inqForm.querySelector('#btnInquirySubmit')
      if (submitBtn) {
        submitBtn.disabled = true
        submitBtn.innerHTML = `접수 완료되었습니다 <i class="ri-check-line" aria-hidden="true"></i>`
      }
      if (inqStatus) {
        inqStatus.className = 'inquiry-form-status is-success'
        inqStatus.textContent = '문의가 성공적으로 접수되었습니다. 담당 매니저가 24시간 내에 연락드리겠습니다.'
      }

      setTimeout(() => {
        closeInquiryModal()
        // 폼 초기화
        inqForm.reset()
        if (submitBtn) {
          submitBtn.disabled = false
          submitBtn.innerHTML = `문의 접수하기 <i class="ri-arrow-right-line" aria-hidden="true"></i>`
        }
        if (inqStatus) inqStatus.textContent = ''
      }, 2500)
    })

    // 입력 시 에러 즉시 해제
    inqForm?.querySelectorAll('.inquiry-form-input').forEach((input) => {
      input.addEventListener('input', () => {
        input.classList.remove('has-error')
        input.closest('.inquiry-form-item')?.querySelector('.inquiry-form-error')?.classList.remove('is-visible')
      })
    })

    inqForm?.querySelector('#agree_chk')?.addEventListener('change', (e) => {
      if (e.target.checked) {
        inqForm.querySelector('.agree-error')?.classList.remove('is-visible')
      }
    })
  }

  // [맨 위로 버튼] index.html .back-top
  const backTop = document.querySelector('.back-top')
  const heroSlider = document.querySelector('.hero-slider')
  if (backTop) {
    const updateBackTopVisibility = () => {
      const heroBottom = heroSlider
        ? heroSlider.offsetTop + heroSlider.offsetHeight - 80
        : 350
      const shouldShow = window.scrollY > heroBottom
      backTop.classList.toggle('back-top--visible', shouldShow)
    }

    window.addEventListener('scroll', updateBackTopVisibility, { passive: true })
    updateBackTopVisibility()

    backTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'instant' : 'smooth' })
    })
  }
})
