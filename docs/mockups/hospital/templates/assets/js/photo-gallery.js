// ════════════════════════════════════════════════════════════════
// PHOTO GALLERY — 큰 사진 슬라이드 + 썸네일 연동 + 진행 바
// components/sub/photo-gallery.html
// ════════════════════════════════════════════════════════════════
document.addEventListener('includes:loaded', () => {
  const section = document.querySelector('.photo-gallery')
  if (!section) return

  const thumbs = new window.Swiper(section.querySelector('.photo-gallery__thumbs'), {
    slidesPerView: 'auto',
    spaceBetween: 10,
    watchSlidesProgress: true,
    a11y: { slideLabelMessage: '{{index}}번 사진 보기' },
  })

  new window.Swiper(section.querySelector('.photo-gallery__main'), {
    speed: 600,
    loop: false,
    autoplay: {
      delay: 4500,
      disableOnInteraction: false,
      pauseOnMouseEnter: true,
    },
    keyboard: { enabled: true, onlyInViewport: true },
    navigation: {
      prevEl: section.querySelector('.photo-gallery__arrow--prev'),
      nextEl: section.querySelector('.photo-gallery__arrow--next'),
    },
    pagination: {
      el: section.querySelector('.photo-gallery__progress'),
      type: 'progressbar',
    },
    thumbs: { swiper: thumbs },
    a11y: {
      prevSlideMessage: '이전 사진',
      nextSlideMessage: '다음 사진',
    },
  })
})
