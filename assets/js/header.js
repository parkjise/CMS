// ════════════════════════════════════════════════════════════════
// HEADER — 메인·서브 페이지 공통
// - 스크롤 시 .header--scrolled
// - 다국어(지구본 아이콘) 드롭다운 토글
// - 전체메뉴(햄버거 버튼) 토글 (.all-menu 및 모바일 .header__nav)
// ════════════════════════════════════════════════════════════════
document.addEventListener('includes:loaded', () => {
  const header = document.getElementById('header')
  if (!header) return

  // 스크롤 시 스타일 전환
  const onScroll = () => header.classList.toggle('header--scrolled', window.scrollY > 16)
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })

  // ── 다국어(지구본) 드롭다운 ──
  const langBox = header.querySelector('.header__lang')
  if (langBox) {
    const langBtn = langBox.querySelector('.header__action-btn--lang')
    const langDropdown = langBox.querySelector('.header__lang-dropdown')

    const toggleLang = (force) => {
      const willOpen = typeof force === 'boolean' ? force : !langBox.classList.contains('is-open')
      langBox.classList.toggle('is-open', willOpen)
      if (langBtn) {
        langBtn.setAttribute('aria-expanded', String(willOpen))
      }
    }

    if (langBtn) {
      langBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        toggleLang()
      })
    }

    // 언어 링크 선택 시 active 반영
    if (langDropdown) {
      langDropdown.querySelectorAll('.header__lang-link').forEach((link) => {
        link.addEventListener('click', (e) => {
          e.preventDefault()
          langDropdown.querySelectorAll('li').forEach((li) => li.classList.remove('is-active'))
          link.closest('li')?.classList.add('is-active')
          toggleLang(false)
        })
      })
    }

    // 바깥 영역 클릭 시 닫기
    document.addEventListener('click', (e) => {
      if (!langBox.contains(e.target)) {
        toggleLang(false)
      }
    })
  }

  // ── 전체메뉴 (All Menu) 토글 ──
  const toggle = header.querySelector('.header__menu-toggle')
  if (!toggle) return

  const allMenu = document.getElementById('all-menu')
  const nav = header.querySelector('.header__nav')
  const icon = toggle.querySelector('i')

  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open))
    toggle.setAttribute('aria-label', open ? '전체 메뉴 닫기' : '전체 메뉴 열기')
    if (icon) {
      icon.className = open ? 'ri-close-line' : 'ri-menu-line'
    }

    if (allMenu) {
      allMenu.classList.toggle('all-menu--open', open)
      allMenu.setAttribute('aria-hidden', String(!open))
      document.body.style.overflow = open ? 'hidden' : ''
    }

    if (nav) {
      nav.classList.toggle('header__nav--open', open)
    }
  }

  toggle.addEventListener('click', () => {
    const isOpen = toggle.getAttribute('aria-expanded') === 'true'
    setOpen(!isOpen)
  })

  // 전체메뉴 닫기 버튼들 (배경 클릭, 닫기 X 버튼 등)
  if (allMenu) {
    allMenu.querySelectorAll('[data-all-menu-close]').forEach((el) => {
      el.addEventListener('click', () => setOpen(false))
    })

    // 언어 링크 토글 (전체메뉴 하단)
    allMenu.querySelectorAll('.all-menu__lang-box a').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault()
        allMenu.querySelectorAll('.all-menu__lang-box li').forEach((li) => li.classList.remove('is-active'))
        link.closest('li')?.classList.add('is-active')
      })
    })

    // 일반 네비게이션 링크 클릭 시 메뉴 닫기 (다국어 링크 제외)
    allMenu.addEventListener('click', (e) => {
      const link = e.target.closest('a')
      if (link && !link.closest('.all-menu__lang-box')) {
        setOpen(false)
      }
    })
  }

  // 모바일 GNB 네비게이션 링크 클릭 시 닫기
  if (nav) {
    nav.addEventListener('click', (e) => {
      if (e.target.closest('a')) setOpen(false)
    })
  }

  // Esc 키로 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const isOpen = toggle.getAttribute('aria-expanded') === 'true'
      if (isOpen) {
        setOpen(false)
        toggle.focus()
      }
      if (langBox) {
        langBox.classList.remove('is-open')
        langBox.querySelector('.header__action-btn--lang')?.setAttribute('aria-expanded', 'false')
      }
    }
  })
})
