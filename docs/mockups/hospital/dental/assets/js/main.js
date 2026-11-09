/**
 * Alba Dental — Main Script (GSAP 인터랙션)
 */
document.addEventListener('includes:loaded', () => {
  initHeader();
  initLang();
  initTodayInfo();
  initDoctors();
  initMedia();
  initKakaoMap();
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
  // 월·목 야간(~20:30), 화·수·금(~18:30), 토(~14:00), 일 휴진
  const HOURS = { 0: null, 1: [9.5, 20.5], 2: [9.5, 18.5], 3: [9.5, 18.5], 4: [9.5, 20.5], 5: [9.5, 18.5], 6: [9.5, 14] };
  const now = new Date();
  const day = now.getDay();
  const t = now.getHours() + now.getMinutes() / 60;
  const today = HOURS[day];
  const status = document.getElementById('todayStatus');
  const fmt = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`;

  document.querySelectorAll('.dental-hours li[data-days]').forEach((li) => {
    const days = li.dataset.days;
    if (days !== 'all' && days.split(',').includes(String(day)) && today) li.classList.add('is-today');
  });
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

// ── 다국어 드롭다운 ──
function initLang() {
  const wrap = document.getElementById('dentalLang');
  const btn = document.getElementById('dentalLangBtn');
  const cur = document.getElementById('dentalLangCur');
  if (!wrap || !btn) return;
  const setOpen = (open) => {
    wrap.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!wrap.classList.contains('is-open'));
  });
  wrap.querySelectorAll('[data-lang]').forEach((opt) =>
    opt.addEventListener('click', () => {
      wrap.querySelectorAll('[data-lang]').forEach((o) => o.setAttribute('aria-selected', String(o === opt)));
      cur.textContent = opt.dataset.lang;
      document.documentElement.lang = { KOR: 'ko', ENG: 'en', JPN: 'ja', CHN: 'zh' }[opt.dataset.lang];
      setOpen(false);
    }),
  );
  document.addEventListener('click', () => setOpen(false));
  window.addEventListener('keydown', (e) => e.key === 'Escape' && setOpen(false));
}

// ── 의료진 슬라이더 (페이드 + 타원 포트레이트 전환) ──
function initDoctors() {
  const root = document.getElementById('dentalDocs');
  if (!root) return;
  const slides = [...root.querySelectorAll('.dental-doc')];
  const tabs = [...root.querySelectorAll('#docPager button')];
  let idx = 0;
  let busy = false;

  const go = (next) => {
    if (busy || next === idx) return;
    next = (next + slides.length) % slides.length;
    const from = slides[idx];
    const to = slides[next];
    tabs.forEach((t, i) => {
      t.classList.toggle('is-active', i === next);
      t.setAttribute('aria-selected', String(i === next));
    });
    if (!window.gsap) {
      from.classList.remove('is-active');
      to.classList.add('is-active');
      idx = next;
      return;
    }
    busy = true;
    const items = (el) => [el.querySelector('.dental-doc__photo'), ...el.querySelectorAll('.dental-doc__body > *')];
    gsap.to(items(from), {
      opacity: 0,
      y: -16,
      duration: 0.45,
      stagger: 0.04,
      ease: 'power2.in',
      onComplete: () => {
        from.classList.remove('is-active');
        to.classList.add('is-active');
        gsap.set(items(from), { clearProps: 'all' });
        gsap.fromTo(
          items(to),
          { opacity: 0, y: 28 },
          { opacity: 1, y: 0, duration: 0.9, stagger: 0.08, ease: 'power3.out', onComplete: () => (busy = false) },
        );
        gsap.fromTo(to.querySelector('.dental-doc__photo'), { scale: 0.92 }, { scale: 1, duration: 1.1, ease: 'power3.out' });
        idx = next;
        ScrollTrigger.refresh();
      },
    });
  };

  document.getElementById('docPrev')?.addEventListener('click', () => go((idx - 1 + slides.length) % slides.length));
  document.getElementById('docNext')?.addEventListener('click', () => go((idx + 1) % slides.length));
  tabs.forEach((t, i) => t.addEventListener('click', () => go(i)));
}

// ── 카카오맵 (JavaScript 키 필요 · 없으면 OSM 임시 지도로 대체) ──
// 1) https://developers.kakao.com 에서 앱 생성 → JavaScript 키 발급
// 2) 플랫폼(Web) 에 사용 도메인 등록 (예: http://localhost:8090)
// 3) 아래 KAKAO_JS_KEY 에 발급받은 키 입력
const KAKAO_JS_KEY = 'YOUR_KAKAO_JAVASCRIPT_KEY';

function initKakaoMap() {
  const el = document.getElementById('kakaoMap');
  if (!el) return;
  const lat = Number(el.dataset.lat);
  const lng = Number(el.dataset.lng);
  const name = el.dataset.name || '';

  const fallback = () => {
    const d = 0.004;
    el.innerHTML = `<iframe title="${name} 위치 지도" loading="lazy"
      src="https://www.openstreetmap.org/export/embed.html?bbox=${lng - d * 1.6}%2C${lat - d}%2C${lng + d * 1.6}%2C${lat + d}&layer=mapnik&marker=${lat}%2C${lng}"></iframe>`;
  };

  if (!KAKAO_JS_KEY || KAKAO_JS_KEY.startsWith('YOUR_')) return fallback();

  const draw = () => {
    kakao.maps.load(() => {
      const center = new kakao.maps.LatLng(lat, lng);
      const map = new kakao.maps.Map(el, { center, level: 3 });
      map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
      const pin = document.createElement('div');
      pin.className = 'dental-map-pin';
      pin.innerHTML = `<span>${name}</span>`;
      new kakao.maps.CustomOverlay({ map, position: center, content: pin, yAnchor: 1.3 });
      new kakao.maps.Marker({ map, position: center });
    });
  };

  if (window.kakao && window.kakao.maps) return draw();
  const sc = document.createElement('script');
  sc.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false`;
  sc.onload = draw;
  sc.onerror = fallback;
  document.head.appendChild(sc);
}

// ── 미디어 (YouTube / Instagram) 탭 및 슬라이더 인터랙션 ──
function initMedia() {
  const tabs = document.querySelectorAll('.dental-media__tab');
  const panels = document.querySelectorAll('.dental-media__panel');
  if (!tabs.length || !panels.length) return;

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('aria-controls');
      tabs.forEach((t) => {
        const isActive = t === tab;
        t.classList.toggle('is-active', isActive);
        t.setAttribute('aria-selected', String(isActive));
      });

      panels.forEach((p) => {
        const isActive = p.id === targetId;
        p.classList.toggle('is-active', isActive);
        if (isActive) {
          p.removeAttribute('hidden');
        } else {
          p.setAttribute('hidden', '');
        }
      });

      if (window.ScrollTrigger) ScrollTrigger.refresh();
    });
  });

  // 페이지네이션 닷 클릭 및 모바일 스크롤 연동
  panels.forEach((panel) => {
    const dots = panel.querySelectorAll('.dental-media__dot');
    const track = panel.querySelector('.dental-media__track');
    const cards = panel.querySelectorAll('.dental-media__card');

    dots.forEach((dot, idx) => {
      dot.addEventListener('click', () => {
        dots.forEach((d) => d.classList.remove('is-active'));
        dot.classList.add('is-active');

        if (track && cards[idx] && window.innerWidth <= 640) {
          cards[idx].scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
        }
      });
    });

    // 모바일 스와이프 시 활성 닷 업데이트
    if (track && dots.length) {
      let isTicking = false;
      track.addEventListener(
        'scroll',
        () => {
          if (!isTicking) {
            window.requestAnimationFrame(() => {
              const scrollLeft = track.scrollLeft;
              const cardWidth = cards[0]?.offsetWidth || 1;
              const activeIndex = Math.min(Math.round(scrollLeft / cardWidth), dots.length - 1);
              dots.forEach((d, i) => d.classList.toggle('is-active', i === activeIndex));
              isTicking = false;
            });
            isTicking = true;
          }
        },
        { passive: true }
      );
    }
  });
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

