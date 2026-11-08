/**
 * Moran Dental — Main Script (GSAP 인터랙션)
 */
document.addEventListener('includes:loaded', () => {
  initHeader();
  initTodayInfo();
  initFaq();
  initGsap();
});

// ── 헤더: 스크롤 시 화이트 전환 + 모바일 드로어 ──
function initHeader() {
  const header = document.getElementById('header');
  const toggle = document.getElementById('dentalMenuToggle');
  const drawer = document.getElementById('dentalDrawer');
  const backdrop = document.getElementById('dentalDrawerBackdrop');
  if (!header) return;

  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 40);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const setOpen = (open) => {
    header.classList.toggle('is-open', open);
    drawer.classList.toggle('is-open', open);
    backdrop.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    drawer.setAttribute('aria-hidden', String(!open));
    document.body.style.overflow = open ? 'hidden' : '';
  };
  toggle?.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  backdrop?.addEventListener('click', () => setOpen(false));
  drawer?.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
  window.addEventListener('keydown', (e) => e.key === 'Escape' && setOpen(false));
}

// ── 오늘 진료 상태 / 요일 하이라이트 (CMS 진료시간 연동 가정) ──
function initTodayInfo() {
  const HOURS = { 0: null, 1: [9.5, 18.5], 2: [9.5, 18.5], 3: [9.5, 18.5], 4: [9.5, 18.5], 5: [9.5, 18.5], 6: [9.5, 14] };
  const now = new Date();
  const day = now.getDay();
  const t = now.getHours() + now.getMinutes() / 60;
  const today = HOURS[day];
  const status = document.getElementById('todayStatus');
  const fmt = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`;

  document.querySelector(`.dental-hours tr[data-day="${day}"]`)?.classList.add('is-today');
  if (!status) return;

  if (!today) {
    status.textContent = '오늘은 휴진입니다';
  } else if (t >= today[0] && t < today[1]) {
    status.dataset.open = 'true';
    status.textContent = `진료 중 · ${fmt(today[1])}까지`;
  } else if (t < today[0]) {
    status.textContent = `오늘 ${fmt(today[0])} 진료 시작`;
  } else {
    status.textContent = '오늘 진료가 종료되었습니다';
  }
}

// ── FAQ 아코디언 ──
function initFaq() {
  document.querySelectorAll('.dental-faq__q').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = btn.nextElementSibling;
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      if (window.gsap) {
        gsap.to(panel, { height: open ? 0 : 'auto', duration: 0.5, ease: 'power3.out' });
      } else {
        panel.style.height = open ? '0' : 'auto';
      }
    });
  });
}

// ── GSAP: 차분하고 스무스한 인터랙션 ──
function initGsap() {
  if (!window.gsap || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  gsap.registerPlugin(ScrollTrigger);
  document.documentElement.classList.add('is-gsap');

  // Hero 인트로 타임라인
  const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
  tl.from('.dental-hero__img', { scale: 1.3, duration: 2.2, ease: 'power2.out' }, 0)
    .from('[data-hero="eyebrow"]', { y: 20, opacity: 0, duration: 1 }, 0.3)
    .from('[data-hero="line"]', { yPercent: 110, duration: 1.3, stagger: 0.15 }, 0.4)
    .from('[data-hero="desc"]', { y: 24, opacity: 0, duration: 1 }, 0.9)
    .from('[data-hero="cta"] > *', { y: 24, opacity: 0, duration: 1, stagger: 0.1 }, 1.05);

  // Hero 패럴랙스
  gsap.to('.dental-hero__bg', {
    yPercent: 14,
    ease: 'none',
    scrollTrigger: { trigger: '.dental-hero', start: 'top top', end: 'bottom top', scrub: true },
  });
  gsap.to('.dental-hero__inner', {
    yPercent: -10,
    opacity: 0.2,
    ease: 'none',
    scrollTrigger: { trigger: '.dental-hero', start: 'top top', end: 'bottom 30%', scrub: true },
  });

  // 일반 reveal (섹션 내 형제 요소 stagger)
  ScrollTrigger.batch('[data-reveal]', {
    start: 'top 88%',
    once: true,
    onEnter: (els) => gsap.fromTo(els, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1, stagger: 0.1, ease: 'power3.out' }),
  });

  // 이미지 마스크 reveal
  gsap.utils.toArray('[data-reveal-img]').forEach((el) => {
    gsap.fromTo(
      el,
      { clipPath: 'inset(12% 8% 12% 8% round 24px)', scale: 0.96 },
      {
        clipPath: 'inset(0% 0% 0% 0% round 0px)',
        scale: 1,
        duration: 1.6,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 85%', once: true },
      },
    );
  });

  // About 서브 이미지 패럴랙스
  gsap.to('.dental-about__img-sub', {
    yPercent: -18,
    ease: 'none',
    scrollTrigger: { trigger: '.dental-about', start: 'top bottom', end: 'bottom top', scrub: 1 },
  });

  // 숫자 카운트업
  document.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    const obj = { v: 0 };
    ScrollTrigger.create({
      trigger: el,
      start: 'top 90%',
      once: true,
      onEnter: () =>
        gsap.to(obj, { v: target, duration: 1.8, ease: 'power2.out', onUpdate: () => (el.textContent = Math.round(obj.v)) }),
    });
  });

  // 진료과목 카드 약한 패럴랙스 (짝수 열 오프셋)
  gsap.utils.toArray('.dental-treat__item').forEach((item, i) => {
    if (i % 2 === 1 && window.innerWidth > 1180) {
      gsap.to(item, {
        y: 48,
        ease: 'none',
        scrollTrigger: { trigger: '.dental-treat__grid', start: 'top bottom', end: 'bottom top', scrub: 1 },
      });
    }
  });

  // 푸터 워드마크
  gsap.from('.dental-footer__word', {
    yPercent: 40,
    opacity: 0,
    duration: 1.6,
    ease: 'power3.out',
    scrollTrigger: { trigger: '.dental-footer__word', start: 'top 100%', once: true },
  });

  ScrollTrigger.refresh();
}
