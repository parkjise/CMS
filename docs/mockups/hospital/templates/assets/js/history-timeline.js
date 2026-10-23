// ════════════════════════════════════════════════════════════════
// HISTORY TIMELINE — 스크롤 위치에 따라 현재 연도·사진·활성 탭 갱신
// components/sub/history-timeline.html
// - 왼쪽 고정 연도 높이(기준선)를 지난 마지막 연도 그룹(.history-timeline__year)을 '현재 연도'로 본다.
// - 탭 이동은 일반 앵커(#history-YYYY) + CSS scroll-margin-top 으로 처리.
// ════════════════════════════════════════════════════════════════
document.addEventListener('includes:loaded', () => {
  const section = document.querySelector('.history-timeline')
  if (!section) return

  const yearEl = section.querySelector('.history-timeline__current-year')
  const figure = section.querySelector('.history-timeline__current-figure')
  const image = section.querySelector('.history-timeline__current-image')
  const navLinks = [...section.querySelectorAll('.history-timeline__nav-link')]
  const years = [...section.querySelectorAll('.history-timeline__year')]

  let current = null

  const setYear = (group) => {
    const { year, image: src } = group.dataset
    if (year === current) return
    current = year

    // 연도 숫자: 살짝 사라졌다 바뀜
    yearEl.classList.add('is-changing')
    setTimeout(() => {
      yearEl.textContent = year
      yearEl.classList.remove('is-changing')
    }, 150)

    // 연도별 대표 사진 (없으면 숨김)
    if (src) {
      image.src = src
      figure.hidden = false
    } else {
      figure.hidden = true
    }

    // 해당 연도가 속한 구간 탭 활성화
    const y = Number(year)
    navLinks.forEach((link) => {
      const inRange = y >= Number(link.dataset.from) && y <= Number(link.dataset.to)
      if (inRange) {
        link.setAttribute('aria-current', 'true')
        // 좁은 화면: 탭 줄이 가로 스크롤될 때 활성 탭이 보이도록
        const list = link.closest('.history-timeline__nav-list')
        list.scrollTo({ left: link.offsetLeft - (list.clientWidth - link.offsetWidth) / 2 })
      } else link.removeAttribute('aria-current')
    })
  }

  // 기준선(왼쪽 고정 연도가 떠 있는 높이)을 지난 마지막 연도 그룹 = 현재 연도
  // (페이지 끝에 닿으면 마지막 연도 — 화면이 커서 마지막 그룹이 기준선까지 못 올라오는 경우 대비)
  const aside = section.querySelector('.history-timeline__aside')
  const pickYear = () => {
    const stickyTop = parseFloat(getComputedStyle(aside).top)
    const line = Number.isNaN(stickyTop) ? window.innerHeight / 3 : stickyTop + 40
    const atBottom =
      window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2
    let active = years[0]
    years.forEach((group) => {
      if (group.getBoundingClientRect().top <= line) active = group
    })
    if (atBottom && years.at(-1).getBoundingClientRect().top < window.innerHeight) {
      active = years.at(-1)
    }
    setYear(active)
  }

  let ticking = false
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        pickYear()
        ticking = false
      })
    },
    { passive: true },
  )

  pickYear()
})
