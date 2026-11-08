/**
 * Oliva Casa — Main Script with GSAP Smooth Animations & Hero Slider
 */
initPreloader();

document.addEventListener('includes:loaded', () => {
  initActiveNavLink();
  initNavLinks();
  initActionButtons();
  initReservationFields();
  initMobileDrawer();
  initHeaderScroll();
  initMenuCatSmoothScroll();
  initReservationPageInteractions();
  initGSAPAnimations();
});

// ── Dinevo 스타일 프리로더 (Preloader) — 공통 자동 주입 및 라이프사이클 제어 ──
function initPreloader() {
  let preloader = document.getElementById('preloader') || document.querySelector('.preloader');

  // DOM에 프리로더 마크업이 없으면 body 최상단에 자동 주입 (개별 HTML 중복 방지 & 전 페이지 공통화)
  if (!preloader && document.body) {
    const preloaderHtml = `
      <div class="preloader" id="preloader" aria-hidden="true">
        <div class="spinner-wrap">
          <div class="preloader-logo">
            <img src="./assets/images/preloader.svg" alt="OLIVA CASA" />
          </div>
          <div class="spinner"></div>
        </div>
      </div>
    `.trim();
    document.body.insertAdjacentHTML('afterbegin', preloaderHtml);
    preloader = document.getElementById('preloader');
  }

  if (!preloader) return;

  let isIncludesLoaded = false;
  let isWindowLoaded = document.readyState === 'complete';
  let isDismissed = false;

  const dismiss = () => {
    if (isDismissed) return;
    isDismissed = true;

    // Dinevo 템플릿의 지연 페이드아웃 효과 구현
    setTimeout(() => {
      preloader.classList.add('is-loaded');
      setTimeout(() => {
        if (preloader.parentNode) {
          preloader.parentNode.removeChild(preloader);
        }
        if (window.ScrollTrigger) {
          window.ScrollTrigger.refresh();
        }
      }, 700);
    }, 700);
  };

  document.addEventListener('includes:loaded', () => {
    isIncludesLoaded = true;
    if (isWindowLoaded) dismiss();
  });

  if (isWindowLoaded) {
    if (isIncludesLoaded) dismiss();
  } else {
    window.addEventListener('load', () => {
      isWindowLoaded = true;
      if (isIncludesLoaded) dismiss();
    });
  }

  // 네트워크 지연 방지용 세이프티 타임아웃 (최대 3초)
  setTimeout(dismiss, 3000);
}

// ── 현재 페이지 활성화 네비게이션 표시 ──
function initActiveNavLink() {
  const currentPath = window.location.pathname.toLowerCase();
  let activeKey = '';

  if (currentPath.includes('story.html')) activeKey = 'story';
  else if (currentPath.includes('menu.html')) activeKey = 'menu';
  else if (currentPath.includes('space.html')) activeKey = 'space';
  else if (currentPath.includes('location.html')) activeKey = 'location';
  else if (currentPath.includes('reservation.html')) activeKey = 'reservation';

  if (!activeKey) return;

  document.querySelectorAll(`[data-nav="${activeKey}"]`).forEach((el) => {
    el.classList.add('is-active');
    el.setAttribute('aria-current', 'page');
  });
}

// ── 메뉴 카테고리 스티키 바 스무스 스크롤 ──
function initMenuCatSmoothScroll() {
  const catLinks = document.querySelectorAll('.oliva-menu-cat-link');
  if (!catLinks.length) return;

  catLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (!href || !href.startsWith('#')) return;

      const target = document.querySelector(href);
      if (!target) return;

      e.preventDefault();
      // 헤더 높이(96/82) + 카테고리 바 높이(84/64) + 여백 감안
      const headerOffset = window.innerWidth <= 820 ? 150 : 185;
      const elementPosition = target.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
    });
  });
}

// ── 예약 페이지 탭 전환 및 폼 인터랙션 ──
function initReservationPageInteractions() {
  const tabRes = document.getElementById('tabReservation');
  const tabInq = document.getElementById('tabInquiry');
  const scheduleGroup = document.getElementById('reservationScheduleGroup');
  const subjectGroup = document.querySelector('.oliva-form-group--subject');
  const noticeEl = document.getElementById('formNotice');
  const submitBtnText = document.getElementById('submitBtnText');
  const form = document.getElementById('olivaReservationForm');

  if (!tabRes || !tabInq || !form) return;

  const setMode = (mode) => {
    const isReservation = mode === 'reservation';

    tabRes.classList.toggle('is-active', isReservation);
    tabRes.setAttribute('aria-selected', isReservation ? 'true' : 'false');

    tabInq.classList.toggle('is-active', !isReservation);
    tabInq.setAttribute('aria-selected', !isReservation ? 'true' : 'false');

    if (scheduleGroup) {
      scheduleGroup.classList.toggle('is-hidden', !isReservation);
      const scheduleInputs = scheduleGroup.querySelectorAll('input, select');
      scheduleInputs.forEach((inp) => {
        if (isReservation) {
          if (inp.id === 'visitDate' || inp.id === 'visitTime' || inp.id === 'partySize') {
            inp.setAttribute('required', '');
          }
        } else {
          inp.removeAttribute('required');
        }
      });
    }

    if (subjectGroup) {
      subjectGroup.classList.toggle('is-visible', !isReservation);
      const subjectInput = subjectGroup.querySelector('input');
      if (subjectInput) {
        if (!isReservation) subjectInput.setAttribute('required', '');
        else subjectInput.removeAttribute('required');
      }
    }

    if (noticeEl) {
      noticeEl.textContent = isReservation
        ? '온라인 예약은 2–6인까지 가능합니다. 7인 이상 모임, 어린이 동반 또는 음식 알레르기가 있으시면 전화로 알려주세요.'
        : '궁금하신 점이나 단체 대관, 촬영 등의 문의 사항을 남겨주시면 정성껏 답변드리겠습니다.';
    }

    if (submitBtnText) {
      submitBtnText.textContent = isReservation ? '예약 신청 내용 보내기' : '문의 내용 보내기';
    }
  };

  tabRes.addEventListener('click', () => setMode('reservation'));
  tabInq.addEventListener('click', () => setMode('inquiry'));

  // 폼 전송 핸들러
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const nameInput = document.getElementById('guestName');
    const guestName = nameInput ? nameInput.value.trim() : '고객';
    const isRes = tabRes.classList.contains('is-active');

    if (isRes) {
      alert(
        `감사합니다, ${guestName}님!\n\n예약 신청이 정상 접수되었습니다 (시안 확인용).\n담당 매니저 확인 후 기재해 주신 연락처로 예약 확정 안내 문자를 전송해 드립니다.\n\n전화 문의: 02-332-0418`,
      );
    } else {
      alert(
        `감사합니다, ${guestName}님!\n\n문의사항이 전달되었습니다 (시안 확인용).\n확인 후 빠른 시일 내에 연락드리겠습니다.`,
      );
    }

    form.reset();
    setMode('reservation');
  });
}

// ── 네비게이션 스무스 스크롤 ──
function initNavLinks() {
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href');
      if (targetId && targetId !== '#') {
        const targetEl = document.querySelector(targetId);
        if (targetEl) {
          e.preventDefault();
          targetEl.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  });
}

// ── 액션 버튼 클릭 핸들러 ──
function initActionButtons() {
  document.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;

    const action = actionBtn.dataset.action;
    if (action === 'check-reservation') {
      alert('선택하신 시간의 예약 가능 여부를 확인했습니다. 전화 예약: 02-332-0418');
    } else if (action === 'map') {
      window.open(
        'https://map.naver.com/p/search/서울%20서대문구%20연희로11길%2018',
        '_blank',
        'noopener,noreferrer',
      );
    } else if (action === 'scroll') {
      const target = actionBtn.dataset.target;
      if (target) {
        const el = document.querySelector(target);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  });
}

// ── 예약 필드 모의 셀렉트 ──
function initReservationFields() {
  const fields = document.querySelectorAll('.oliva-reservation__field-select');
  fields.forEach((field) => {
    field.addEventListener('click', () => {
      field.classList.toggle('is-active');
    });
  });
}

// ── 모바일 햄버거 메뉴 & 슬라이드 드로어 ──
function initMobileDrawer() {
  const toggle = document.getElementById('mobileMenuToggle');
  const drawer = document.getElementById('mobileDrawer');
  const backdrop = document.getElementById('mobileDrawerBackdrop');
  const closeBtn = document.getElementById('mobileDrawerClose');

  if (!toggle || !drawer || !backdrop) return;

  const openDrawer = () => {
    drawer.classList.add('is-open');
    backdrop.classList.add('is-visible');
    toggle.classList.add('is-active');
    toggle.setAttribute('aria-expanded', 'true');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('menu-open');
  };

  const closeDrawer = () => {
    drawer.classList.remove('is-open');
    backdrop.classList.remove('is-visible');
    toggle.classList.remove('is-active');
    toggle.setAttribute('aria-expanded', 'false');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('menu-open');
  };

  toggle.addEventListener('click', () => {
    const isOpen = drawer.classList.contains('is-open');
    if (isOpen) {
      closeDrawer();
    } else {
      openDrawer();
    }
  });

  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);

  drawer.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeDrawer);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) {
      closeDrawer();
    }
  });
}

// ── 헤더 스크롤 시 화이트 배경 & 픽스 효과 ──
function initHeaderScroll() {
  const header = document.getElementById('header') || document.querySelector('.oliva-header');
  if (!header) return;

  const onScroll = () => {
    const isScrolled = window.scrollY > 20;
    header.classList.toggle('oliva-header--scrolled', isScrolled);
    header.classList.toggle('is-scrolled', isScrolled);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // 초기 로드 시 스크롤 위치 반영
}

// ══════════════════════════════════════════════════════════════════
// GSAP & ScrollTrigger Animations
// ══════════════════════════════════════════════════════════════════
function initGSAPAnimations() {
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;

  if (!gsap) {
    console.warn('[Oliva] GSAP 라이브러리가 로드되지 않았습니다.');
    return;
  }

  // 모션 감소 선호 환경 체크
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) return;

  if (ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
  }

  initHeroAnimations(gsap);
  initHeroSlider(gsap);

  if (ScrollTrigger) {
    initScrollTriggers(gsap, ScrollTrigger);
  }
}

// ── 1. 히어로 인트로 애니메이션 ──
function initHeroAnimations(gsap) {
  const hero = document.getElementById('hero');
  if (!hero) return;

  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

  // 헤더 페이드인
  const header = document.getElementById('header');
  if (header) {
    tl.from(header, {
      opacity: 0,
      y: -15,
      duration: 0.9,
      clearProps: 'transform',
    });
  }

  // 히어로 텍스트 순차 등장
  tl.from(
    '.oliva-hero__eyebrow',
    {
      opacity: 0,
      y: 15,
      duration: 0.8,
    },
    '-=0.5',
  )
    .from(
      '.oliva-hero__title-en span',
      {
        opacity: 0,
        y: 35,
        stagger: 0.12,
        duration: 1.1,
      },
      '-=0.6',
    )
    .from(
      '.oliva-hero__title-kr span',
      {
        opacity: 0,
        y: 25,
        stagger: 0.12,
        duration: 1.0,
      },
      '-=0.8',
    )
    .from(
      '.oliva-hero__desc',
      {
        opacity: 0,
        y: 20,
        duration: 0.9,
      },
      '-=0.7',
    )
    .from(
      '.oliva-hero__actions > *',
      {
        opacity: 0,
        y: 20,
        stagger: 0.1,
        duration: 0.8,
      },
      '-=0.6',
    )
    .from(
      '.oliva-hero__slider',
      {
        opacity: 0,
        scale: 0.96,
        duration: 1.3,
        ease: 'power2.out',
      },
      '-=1.0',
    )
    .from(
      '.oliva-hero__caption > *',
      {
        opacity: 0,
        y: 10,
        stagger: 0.1,
        duration: 0.8,
      },
      '-=0.6',
    );
}

// ── 2. 히어로 슬라이더 (GSAP 부드러운 전환) ──
function initHeroSlider(gsap) {
  const slider = document.getElementById('heroSlider');
  if (!slider) return;

  const slides = slider.querySelectorAll('.oliva-hero__slide');
  const dots = slider.querySelectorAll('.oliva-hero__dot');
  const quoteEl = document.getElementById('heroQuote');

  if (!slides.length) return;

  let currentIndex = 0;
  let isTransitioning = false;
  let autoplayTimer = null;

  function goToSlide(nextIndex) {
    if (isTransitioning || nextIndex === currentIndex) return;
    isTransitioning = true;

    const currentSlide = slides[currentIndex];
    const nextSlide = slides[nextIndex];
    const currentImg = currentSlide.querySelector('.oliva-hero__image');
    const nextImg = nextSlide.querySelector('.oliva-hero__image');
    const nextQuote = nextSlide.dataset.quote || '';

    // 인디케이터 업데이트
    dots[currentIndex]?.classList.remove('is-active');
    dots[nextIndex]?.classList.add('is-active');

    // 캡션 텍스트 부드러운 페이드
    if (quoteEl && nextQuote) {
      gsap.to(quoteEl, {
        opacity: 0,
        y: -6,
        duration: 0.35,
        onComplete: () => {
          quoteEl.textContent = nextQuote;
          gsap.to(quoteEl, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' });
        },
      });
    }

    // 다음 슬라이드 표시 준비
    nextSlide.classList.add('is-active');

    const tl = gsap.timeline({
      defaults: { duration: 1.25, ease: 'power2.inOut' },
      onComplete: () => {
        currentSlide.classList.remove('is-active');
        gsap.set(currentSlide, { opacity: 0, visibility: 'hidden' });
        currentIndex = nextIndex;
        isTransitioning = false;
      },
    });

    // 현재 슬라이드 페이드아웃 + 미세한 줌아웃
    tl.to(currentSlide, { opacity: 0 })
      .to(currentImg, { scale: 1.05 }, 0)
      // 다음 슬라이드 페이드인 + 부드러운 스케일
      .fromTo(nextSlide, { opacity: 0, visibility: 'visible' }, { opacity: 1 }, 0)
      .fromTo(nextImg, { scale: 1.0 }, { scale: 1.03 }, 0);
  }

  // 닷 버튼 클릭
  dots.forEach((dot, idx) => {
    dot.addEventListener('click', () => {
      goToSlide(idx);
      restartAutoplay();
    });
  });

  // 자동 재생 (5초 주기)
  function startAutoplay() {
    autoplayTimer = setInterval(() => {
      const next = (currentIndex + 1) % slides.length;
      goToSlide(next);
    }, 5000);
  }

  function stopAutoplay() {
    if (autoplayTimer) clearInterval(autoplayTimer);
  }

  function restartAutoplay() {
    stopAutoplay();
    startAutoplay();
  }

  slider.addEventListener('mouseenter', stopAutoplay);
  slider.addEventListener('mouseleave', startAutoplay);

  startAutoplay();
}

// ── 3. 고급스러운 스크롤 인터랙션 (ScrollTrigger) ──
function initScrollTriggers(gsap, ScrollTrigger) {
  // A. 데일리 서비스 바 은은한 등장
  gsap.from('.oliva-service-bar__inner > *', {
    scrollTrigger: {
      trigger: '.oliva-service-bar',
      start: 'top 92%',
      toggleActions: 'play none none none',
    },
    opacity: 0,
    y: 18,
    stagger: 0.15,
    duration: 1.0,
    ease: 'power2.out',
  });

  // B. 철학 섹션 (올리브 모티프 & 인용문)
  const philTimeline = gsap.timeline({
    scrollTrigger: {
      trigger: '.oliva-philosophy',
      start: 'top 82%',
      toggleActions: 'play none none none',
    },
  });

  philTimeline
    .from('.oliva-philosophy__motif .oliva-rule', {
      scaleX: 0,
      transformOrigin: 'center',
      duration: 1.1,
      ease: 'power3.out',
    })
    .from(
      '.oliva-leaf-icon',
      {
        scale: 0.6,
        opacity: 0,
        rotation: -10,
        duration: 0.9,
        ease: 'back.out(1.6)',
      },
      '-=0.7',
    )
    .from(
      ['.oliva-philosophy .oliva-eyebrow', '.oliva-philosophy__title', '.oliva-philosophy__desc'],
      {
        opacity: 0,
        y: 28,
        stagger: 0.16,
        duration: 1.1,
        ease: 'power3.out',
      },
      '-=0.5',
    );

  // C. 시그니처 메뉴 섹션
  gsap.from('.oliva-menu__header > *', {
    scrollTrigger: {
      trigger: '.oliva-menu',
      start: 'top 85%',
      toggleActions: 'play none none none',
    },
    opacity: 0,
    y: 28,
    stagger: 0.15,
    duration: 1.0,
    ease: 'power3.out',
  });

  // 3가지 요리 카드 부드러운 캐스케이드 등장
  gsap.from('.oliva-dish-card', {
    scrollTrigger: {
      trigger: '.oliva-menu__grid',
      start: 'top 82%',
      toggleActions: 'play none none none',
    },
    opacity: 0,
    y: 45,
    stagger: 0.18,
    duration: 1.2,
    ease: 'power3.out',
  });

  // 요리 카드 이미지 미세 패럴랙스
  document.querySelectorAll('.oliva-dish-card__img').forEach((img) => {
    gsap.fromTo(
      img,
      { yPercent: -4, scale: 1.04 },
      {
        yPercent: 4,
        scale: 1.0,
        ease: 'none',
        scrollTrigger: {
          trigger: img.closest('.oliva-dish-card'),
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1.2,
        },
      },
    );
  });

  // 추가 메뉴 그룹 등장
  gsap.from('.oliva-menu-group', {
    scrollTrigger: {
      trigger: '.oliva-menu-more',
      start: 'top 86%',
      toggleActions: 'play none none none',
    },
    opacity: 0,
    y: 24,
    stagger: 0.18,
    duration: 1.0,
    ease: 'power2.out',
  });

  // D. 핸드메이드 스토리 섹션 (다크 올리브)
  gsap.from('.oliva-story__visual', {
    scrollTrigger: {
      trigger: '.oliva-story',
      start: 'top 78%',
      toggleActions: 'play none none none',
    },
    opacity: 0,
    x: -30,
    duration: 1.25,
    ease: 'power3.out',
  });

  gsap.from('.oliva-story__content > *', {
    scrollTrigger: {
      trigger: '.oliva-story',
      start: 'top 78%',
      toggleActions: 'play none none none',
    },
    opacity: 0,
    y: 24,
    stagger: 0.14,
    duration: 1.1,
    ease: 'power3.out',
  });

  gsap.from('.oliva-principle', {
    scrollTrigger: {
      trigger: '.oliva-story__principles',
      start: 'top 88%',
      toggleActions: 'play none none none',
    },
    opacity: 0,
    y: 20,
    stagger: 0.14,
    duration: 0.9,
    ease: 'power2.out',
  });

  // E. 가을 코스 섹션 (웜 베이지)
  gsap.from('.oliva-seasonal__content > *', {
    scrollTrigger: {
      trigger: '.oliva-seasonal',
      start: 'top 80%',
      toggleActions: 'play none none none',
    },
    opacity: 0,
    y: 25,
    stagger: 0.14,
    duration: 1.05,
    ease: 'power3.out',
  });

  gsap.from('.oliva-seasonal__visual', {
    scrollTrigger: {
      trigger: '.oliva-seasonal',
      start: 'top 80%',
      toggleActions: 'play none none none',
    },
    opacity: 0,
    scale: 0.96,
    duration: 1.2,
    ease: 'power2.out',
  });

  // F. 와인 모먼트 섹션
  gsap.from('.oliva-wine__visual', {
    scrollTrigger: {
      trigger: '.oliva-wine',
      start: 'top 80%',
      toggleActions: 'play none none none',
    },
    opacity: 0,
    y: 30,
    duration: 1.2,
    ease: 'power3.out',
  });

  gsap.from('.oliva-wine__content > *', {
    scrollTrigger: {
      trigger: '.oliva-wine',
      start: 'top 80%',
      toggleActions: 'play none none none',
    },
    opacity: 0,
    y: 25,
    stagger: 0.14,
    duration: 1.1,
    ease: 'power3.out',
  });

  gsap.from('.oliva-wine-item', {
    scrollTrigger: {
      trigger: '.oliva-wine__list',
      start: 'top 88%',
      toggleActions: 'play none none none',
    },
    opacity: 0,
    x: 20,
    stagger: 0.14,
    duration: 0.9,
    ease: 'power2.out',
  });

  // G. 공간 갤러리 섹션
  gsap.from('.oliva-space__header > *', {
    scrollTrigger: {
      trigger: '.oliva-space',
      start: 'top 85%',
      toggleActions: 'play none none none',
    },
    opacity: 0,
    y: 25,
    stagger: 0.14,
    duration: 1.0,
    ease: 'power3.out',
  });

  gsap.from('.oliva-space-card', {
    scrollTrigger: {
      trigger: '.oliva-space__gallery',
      start: 'top 82%',
      toggleActions: 'play none none none',
    },
    opacity: 0,
    y: 40,
    stagger: 0.22,
    duration: 1.2,
    ease: 'power3.out',
  });

  // H. 고객 후기 섹션
  gsap.from('.oliva-review__inner > *', {
    scrollTrigger: {
      trigger: '.oliva-review',
      start: 'top 82%',
      toggleActions: 'play none none none',
    },
    opacity: 0,
    y: 24,
    stagger: 0.16,
    duration: 1.1,
    ease: 'power2.out',
  });

  // I. 예약 섹션 (차분하게 올라오는 폼)
  gsap.from('.oliva-reservation__header > *', {
    scrollTrigger: {
      trigger: '.oliva-reservation',
      start: 'top 85%',
      toggleActions: 'play none none none',
    },
    opacity: 0,
    y: 25,
    stagger: 0.14,
    duration: 1.0,
    ease: 'power3.out',
  });

  gsap.from('.oliva-reservation__form', {
    scrollTrigger: {
      trigger: '.oliva-reservation__form',
      start: 'top 85%',
      toggleActions: 'play none none none',
    },
    opacity: 0,
    y: 35,
    duration: 1.15,
    ease: 'power3.out',
  });

  // J. 오시는 길 & 정보
  gsap.from('.oliva-location__col', {
    scrollTrigger: {
      trigger: '.oliva-location',
      start: 'top 82%',
      toggleActions: 'play none none none',
    },
    opacity: 0,
    y: 30,
    stagger: 0.18,
    duration: 1.1,
    ease: 'power3.out',
  });

  // K. 푸터 대형 시그니처 타이포그래피
  gsap.from('.oliva-footer__brand-large', {
    scrollTrigger: {
      trigger: '.oliva-footer__signature',
      start: 'top 90%',
      toggleActions: 'play none none none',
    },
    opacity: 0,
    y: 35,
    duration: 1.4,
    ease: 'power3.out',
  });

  gsap.from('.oliva-footer__tagline', {
    scrollTrigger: {
      trigger: '.oliva-footer__signature',
      start: 'top 90%',
      toggleActions: 'play none none none',
    },
    opacity: 0,
    y: 18,
    duration: 1.1,
    delay: 0.2,
    ease: 'power2.out',
  });

  // ── 서브페이지 공통 스크롤 애니메이션 ──
  // L. 서브 히어로 인트로
  if (document.querySelector('.oliva-sub-hero')) {
    gsap.from('.oliva-sub-hero__titles > *, .oliva-sub-hero__note > *', {
      opacity: 0,
      y: 20,
      stagger: 0.12,
      duration: 1.0,
      ease: 'power3.out',
    });

    gsap.from('.oliva-sub-hero__visual, .oliva-sub-hero__panorama-wrap, .oliva-menu-intro__visual', {
      opacity: 0,
      y: 30,
      duration: 1.2,
      delay: 0.2,
      ease: 'power3.out',
    });
  }

  // M. 서브페이지 주요 섹션 순차 페이드인
  const subSections = [
    '.oliva-story-phil',
    '.oliva-story-kitchen',
    '.oliva-story-season',
    '.oliva-story-space',
    '.oliva-menu-signature',
    '.oliva-alacarte',
    '.oliva-menu-wine',
    '.oliva-menu-course',
    '.oliva-dining-guide',
    '.oliva-space-materials',
    '.oliva-space-perspectives',
    '.oliva-space-time',
    '.oliva-space-gallery',
    '.oliva-loc-map-sec',
    '.oliva-transit-sec',
    '.oliva-visit-checklist',
    '.oliva-res-main-sec',
    '.oliva-res-timeline',
    '.oliva-res-faq',
    '.oliva-sub-cta',
  ];

  subSections.forEach((selector) => {
    const el = document.querySelector(selector);
    if (!el) return;

    gsap.from(el, {
      scrollTrigger: {
        trigger: el,
        start: 'top 85%',
        toggleActions: 'play none none none',
      },
      opacity: 0,
      y: 25,
      duration: 1.05,
      ease: 'power3.out',
    });
  });
}
