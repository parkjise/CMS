// ── 로딩 화면 (참고: archin home-5 Preloader) ─────────────────────
// 글자 사라짐 → 하단 곡선이 위로 휘며 → 평평해지고 → 화면 위로 걷힘
/* global gsap */
document.addEventListener('DOMContentLoaded', () => {
  const loader = document.querySelector('.loader');
  if (!loader) return;

  const hide = () => loader.remove();
  if (typeof gsap === 'undefined') return hide();

  const path = loader.querySelector('.loader__path');
  const curve = 'M0 502S175 272 500 272s500 230 500 230V0H0Z';
  const flat = 'M0 2S175 1 500 1s500 1 500 1V0H0Z';

  const tl = gsap.timeline({ onComplete: hide });

  tl.to('.loader__text', { delay: 1.5, y: -100, opacity: 0 })
    .to(path, { duration: 0.5, attr: { d: curve }, ease: 'power2.in' })
    .to(path, { duration: 0.5, attr: { d: flat }, ease: 'power2.out' })
    .to(loader, { y: -1500 });

  // header 는 include 로 늦게 붙으므로 있을 때만 올라오는 효과
  const header = document.querySelector('.header');
  if (header) tl.from(header, { y: 200 }, '-=1.5');
});
