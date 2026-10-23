// ════════════════════════════════════════════════════════════════
// QUICK MENU — 메인·서브 공통 (components/quick-menu.html)
// - 퀵메뉴 버튼: 바로가기 링크 펼침/접힘 (마우스 hover 는 CSS 가 처리)
// - 간편상담: 데스크톱 버튼·모바일 하단 바 버튼이 같은 패널을 연다
//   열면 첫 입력칸으로 포커스, 닫기 버튼·Esc 로 닫으면 연 버튼으로 포커스 복귀
// - 폼 제출: 필수값 검사 후 접수 메시지만 표시 (실제 전송은 API 연동 시 구현)
// - 상단으로: 부드럽게 맨 위로 스크롤 (동작 줄이기 설정이면 즉시 이동)
// ════════════════════════════════════════════════════════════════
document.addEventListener('includes:loaded', () => {
  const root = document.querySelector('.quick-menu')
  if (!root) return

  // ── 퀵메뉴 펼침 ──
  const shortcut = root.querySelector('.quick-menu__shortcut')
  const toggle = root.querySelector('.quick-menu__button--toggle')
  shortcut.style.setProperty(
    '--quick-menu-link-count',
    String(shortcut.querySelector('.quick-menu__links').children.length),
  )
  const setShortcut = (open) => {
    toggle.setAttribute('aria-expanded', String(open))
    shortcut.classList.toggle('quick-menu__shortcut--open', open)
  }
  toggle.addEventListener('click', () => setShortcut(toggle.getAttribute('aria-expanded') !== 'true'))

  // ── 간편상담 패널 ──
  const panel = root.querySelector('.quick-menu__panel')
  const openers = root.querySelectorAll('[data-consult-open]')
  const form = panel.querySelector('.quick-menu__form')
  const status = panel.querySelector('.quick-menu__status')
  let lastOpener = null

  const isOpen = () => panel.classList.contains('quick-menu__panel--open')
  const setPanel = (open, opener) => {
    panel.classList.toggle('quick-menu__panel--open', open)
    openers.forEach((btn) => btn.setAttribute('aria-expanded', String(open)))
    if (open) {
      lastOpener = opener
      status.textContent = ''
      setShortcut(false)
      panel.querySelector('input').focus({ preventScroll: true })
    } else {
      lastOpener?.focus()
    }
  }
  openers.forEach((btn) =>
    btn.addEventListener('click', () => setPanel(!isOpen() || lastOpener !== btn, btn)),
  )
  panel.querySelector('.quick-menu__close').addEventListener('click', () => setPanel(false))

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (isOpen()) setPanel(false)
    else if (shortcut.classList.contains('quick-menu__shortcut--open')) {
      setShortcut(false)
      toggle.focus()
    }
  })

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const invalid = form.querySelector(':invalid')
    if (invalid) {
      status.textContent = invalid.type === 'checkbox' ? '필수 동의 항목에 체크해주세요.' : '필수 항목을 입력해주세요.'
      invalid.focus()
      return
    }
    status.textContent = '상담 신청이 접수되었습니다. 담당자가 곧 연락드리겠습니다.'
    form.reset()
  })

  // ── 상단으로 ──
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  root.querySelector('.quick-menu__button--top').addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' })
    document.getElementById('main')?.focus({ preventScroll: true })
  })
})
