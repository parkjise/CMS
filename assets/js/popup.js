/* global Swiper */
// ════════════════════════════════════════════════════════════════
// 메인 팝업 게이트 & 슬라이드 (ELEV Clinic Style Multi-slide Popup)
// - 팝업 열림 시 전체 딤(배경 어두움) 및 본문 스크롤 잠금
// - 메인 슬라이더 및 모션은 팝업이 닫힐 때까지 대기 (mainPopupGate)
// - 팝업 닫기 시 딤 제거, 본문 스크롤 복원 및 메인 모션 작동
// - 다중 슬라이드 지원 (Swiper.js Fraction 페이징 + Autoplay)
// - 오늘 하루 보지 않기 (localStorage 만료 시간 24시간 저장)
// ════════════════════════════════════════════════════════════════

const POPUP_STORAGE_KEY = 'elev_main_popup_hidden_until'

// 오늘 하루 보지 않기 체크 여부 확인
const isPopupHidden = () => {
  try {
    const hiddenUntil = localStorage.getItem(POPUP_STORAGE_KEY)
    if (!hiddenUntil) return false
    return Date.now() < parseInt(hiddenUntil, 10)
  } catch {
    return false
  }
}

// ── ELEV Clinic 스타일 메인 팝업 게이트 ──
// 팝업이 떠 있는 동안 메인 모션(슬라이더 자동재생, 텍스트 모션 등)을 잠그고 닫힌 후 시작
window.mainPopupGate = (function () {
  var isOpen = false
  var queue = []
  return {
    open: function () {
      if (isOpen) return
      isOpen = true
      document.body.classList.add('popup-scroll-locked')
      document.body.style.overflow = 'hidden'
    },
    close: function () {
      if (!isOpen) return
      isOpen = false
      document.body.classList.remove('popup-scroll-locked')
      document.body.style.overflow = ''
      var q = queue
      queue = []
      q.forEach(function (fn) {
        try {
          fn()
        } catch (err) {
          console.error(err)
        }
      })
    },
    then: function (fn) {
      if (isOpen) {
        queue.push(fn)
      } else {
        fn()
      }
    },
    isOpen: function () {
      return isOpen
    },
  }
})()

// 팝업이 열릴 예정이면 스크립트 로드 즉시 게이트 잠금
if (!isPopupHidden()) {
  window.mainPopupGate.open()
}

document.addEventListener('includes:loaded', () => {
  const popupWrap = document.getElementById('mainPopup')
  const popupBg = document.getElementById('mainPopupBg')
  if (!popupWrap) return

  // 팝업 열기 (딤 배경 + 팝업 래퍼)
  const showPopup = () => {
    if (popupBg) {
      popupBg.style.display = 'block'
      requestAnimationFrame(() => {
        popupBg.classList.add('is-visible')
      })
    }
    popupWrap.style.display = 'block'
    requestAnimationFrame(() => {
      popupWrap.classList.add('is-visible')
    })
  }

  // 팝업 닫기 (딤 제거 + 본문 모션 게이트 해제)
  const closePopup = () => {
    if (popupBg) popupBg.classList.remove('is-visible')
    popupWrap.classList.remove('is-visible')

    setTimeout(() => {
      if (popupBg) popupBg.style.display = 'none'
      popupWrap.style.display = 'none'
      // 메인 팝업 게이트 해제 → 메인 슬라이더 등 후속 모션 시작
      window.mainPopupGate.close()
    }, 350)
  }

  // 오늘 하루 보지 않기 저장 (24시간)
  const saveHideCookie = () => {
    try {
      const oneDayMs = 24 * 60 * 60 * 1000
      localStorage.setItem(POPUP_STORAGE_KEY, String(Date.now() + oneDayMs))
    } catch {
      // localStorage 불가 환경 대응
    }
  }

  // 초기 실행: 숨김 조건 아니면 표시
  if (!isPopupHidden()) {
    showPopup()

    // Swiper 초기화 (슬라이드가 2개 이상일 때 페이징 및 루프 활성화)
    const slides = popupWrap.querySelectorAll('.swiper-slide')
    const paginationEl = popupWrap.querySelector('.swiper-pagination')

    if (typeof Swiper !== 'undefined' && slides.length > 1) {
      new Swiper('.main-popup-slide', {
        loop: true,
        speed: 800,
        autoplay: {
          delay: 4500,
          disableOnInteraction: false,
          pauseOnMouseEnter: true,
        },
        pagination: {
          el: paginationEl,
          type: 'fraction',
        },
      })
    } else if (paginationEl) {
      paginationEl.style.display = 'none'
    }
  } else {
    // 팝업이 노출되지 않는 상태라면 즉시 게이트 해제
    window.mainPopupGate.close()
  }

  // 닫기 버튼 이벤트
  const closeBtn = document.getElementById('mainPopupClose')
  const popupCheck = document.getElementById('popupCheck')

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      if (popupCheck && popupCheck.checked) {
        saveHideCookie()
      }
      closePopup()
    })
  }

  // 딤 배경 클릭 시 닫기
  if (popupBg) {
    popupBg.addEventListener('click', () => {
      if (popupCheck && popupCheck.checked) {
        saveHideCookie()
      }
      closePopup()
    })
  }

  // 체크박스 클릭 시 즉시 닫고 저장하기 (ELEV 클리닉 UX)
  if (popupCheck) {
    popupCheck.addEventListener('change', () => {
      if (popupCheck.checked) {
        saveHideCookie()
        closePopup()
      }
    })
  }

  // ESC 키로 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && popupWrap.classList.contains('is-visible')) {
      if (popupCheck && popupCheck.checked) {
        saveHideCookie()
      }
      closePopup()
    }
  })
})
