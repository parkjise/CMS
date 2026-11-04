// ── 로딩 화면 (참고: archin home-5 Preloader) ─────────────────────
// 글자 사라짐 → 하단 곡선이 위로 휘며 → 평평해지고 → 화면 위로 걷힘
// - 메인 팝업이 떠 있는 경우: 팝업 닫기 전까지 대기하다가, 팝업 닫기 시 로딩 화면 모션 진행
// - 팝업이 없거나 오늘 하루 보지 않기 상태인 경우: 기존처럼 즉시 로딩 화면 진행
/* global gsap */
document.addEventListener('DOMContentLoaded', () => {
  const loader = document.querySelector('.loader');
  if (!loader) return;

  const hide = () => {
    loader.remove();
    window.dispatchEvent(new CustomEvent('loader:done'));
  };
  if (typeof gsap === 'undefined') return hide();

  const path = loader.querySelector('.loader__path');
  const curve = 'M0 502S175 272 500 272s500 230 500 230V0H0Z';
  const flat = 'M0 2S175 1 500 1s500 1 500 1V0H0Z';

  const runLoader = (fromPopup) => {
    loader.classList.remove('loader--waiting-popup');
    const tl = gsap.timeline({ onComplete: hide });

    if (fromPopup) {
      // 팝업 닫기 직후: 커튼이 곡선을 그리며 위로 걷혀 본문 노출
      tl.to(path, { duration: 0.6, attr: { d: curve }, ease: 'power2.in' })
        .to(path, { duration: 0.5, attr: { d: flat }, ease: 'power2.out' })
        .to(loader, { duration: 0.6, y: -1500, ease: 'power3.inOut' });
    } else {
      // 일반 로딩 (팝업 미노출 시): 텍스트 깜빡임 후 커튼 위로 걷힘
      tl.to('.loader__text', { delay: 1.2, y: -100, opacity: 0 })
        .to(path, { duration: 0.5, attr: { d: curve }, ease: 'power2.in' })
        .to(path, { duration: 0.5, attr: { d: flat }, ease: 'power2.out' })
        .to(loader, { y: -1500 });
    }
  };

  const isPopupPending = () => {
    if (window.mainPopupGate && window.mainPopupGate.isOpen()) return true;
    try {
      const hiddenUntil = localStorage.getItem('elev_main_popup_hidden_until');
      if (hiddenUntil && Date.now() < parseInt(hiddenUntil, 10)) return false;
    } catch (e) {
      return false;
    }
    return Boolean(document.querySelector('[data-include*="popup.html"], #mainPopup'));
  };

  if (isPopupPending()) {
    loader.classList.add('loader--waiting-popup');
    let executed = false;
    const proceed = () => {
      if (executed) return;
      executed = true;
      runLoader(true);
    };

    if (window.mainPopupGate) {
      window.mainPopupGate.then(proceed);
    }
    window.addEventListener('mainPopup:closed', proceed, { once: true });
  } else {
    runLoader(false);
  }
});
