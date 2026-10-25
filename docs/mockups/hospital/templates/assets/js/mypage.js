// ════════════════════════════════════════════════════════════════
// MYPAGE — 마이페이지 탭 · 예약 필터/취소 · 알림 토글 · 내 정보 수정 · 소셜 연결 (기획서 16.7)
// - 탭: role=tablist 키보드(←/→/Home/End) + 주소 #reservations · #inquiries · #notifications · #info
// - 목업: 바뀐 값은 화면에서만 유지 (실제는 PATCH /members/me · /members/me/notification,
//   POST /members/reservations/{id}/cancel 등 — 기획서 16.10)
// - 비밀번호 변경 폼 검사는 board-form.js, 비밀번호 조건 표시는 member-form.js
// ════════════════════════════════════════════════════════════════
document.addEventListener('includes:loaded', () => {
  const root = document.querySelector('.mypage')
  if (!root) return

  const say = (el, message, ok = true) => {
    el.textContent = message
    el.classList.toggle('mypage__status--error', !ok)
  }

  // ── 탭
  const tabs = [...root.querySelectorAll('[role="tab"]')]
  const select = (tab, focus) => {
    tabs.forEach((item) => {
      const on = item === tab
      item.setAttribute('aria-selected', String(on))
      item.tabIndex = on ? 0 : -1
      document.getElementById(item.getAttribute('aria-controls')).hidden = !on
    })
    if (focus) tab.focus()
    history.replaceState(null, '', `#${tab.getAttribute('aria-controls')}`)
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab))
    tab.addEventListener('keydown', (e) => {
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key]
      if (next === undefined) return
      e.preventDefault()
      select(tabs[(next + tabs.length) % tabs.length], true)
    })
  })
  const fromHash = tabs.find((tab) => `#${tab.getAttribute('aria-controls')}` === location.hash)
  if (fromHash) select(fromHash)

  // ── 내 예약: 상태 · 기간 필터 (기간은 data-today 기준 n개월 전 이후)
  const list = root.querySelector('[data-reservations]')
  if (list) {
    const empty = root.querySelector('[data-reservations-empty]')
    const statusEl = root.querySelector('[data-reservation-status]')
    const statusFilter = root.querySelector('[data-filter="status"]')
    const periodFilter = root.querySelector('[data-filter="period"]')
    const today = new Date(list.dataset.today)

    const apply = () => {
      const from = new Date(today)
      if (periodFilter.value !== 'all') from.setMonth(from.getMonth() - Number(periodFilter.value))
      let shown = 0
      list.querySelectorAll('.mypage__card').forEach((card) => {
        const okStatus = statusFilter.value === 'all' || card.dataset.status === statusFilter.value
        const okPeriod = periodFilter.value === 'all' || new Date(card.dataset.date) >= from
        card.hidden = !(okStatus && okPeriod)
        if (!card.hidden) shown += 1
      })
      empty.hidden = shown > 0
    }
    statusFilter.addEventListener('change', apply)
    periodFilter.addEventListener('change', apply)
    apply()

    // 예약 취소 (대기 · 확정만 버튼 있음)
    list.addEventListener('click', (e) => {
      const button = e.target.closest('[data-cancel]')
      if (!button) return
      const card = button.closest('.mypage__card')
      const when = card.querySelector('time').textContent
      if (!window.confirm(`${when} 예약을 취소할까요?`)) return
      const badge = card.querySelector('[data-badge]')
      badge.className = 'mypage__badge mypage__badge--cancelled'
      badge.textContent = '예약 취소'
      card.dataset.status = 'cancelled'
      card.querySelector('.mypage__card-actions').remove()
      say(statusEl, `${when} 예약이 취소되었어요. 취소 안내 문자를 보내드렸어요.`)
      apply()
    })
  }

  // ── 알림 설정: 토글 즉시 저장
  const notify = root.querySelector('[data-notify]')
  if (notify) {
    const statusEl = root.querySelector('[data-notify-status]')
    notify.addEventListener('change', (e) => {
      const name = e.target.labels[0].firstChild.textContent.trim()
      say(statusEl, `${name}을 ${e.target.checked ? '켰어요' : '껐어요'}. 저장되었습니다.`)
    })
  }

  // ── 내 정보: [수정] → 입력 → [저장] / Esc 취소
  const infoStatus = root.querySelector('[data-info-status]')
  // 받침 있으면 '이', 없으면 '가'
  const josa = (word) => ((word.charCodeAt(word.length - 1) - 0xac00) % 28 ? '이' : '가')
  const formatPhone = (v) => v.replace(/[^0-9]/g, '').replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3')
  root.querySelectorAll('[data-edit]').forEach((row) => {
    const value = row.querySelector('[data-edit-value]')
    const input = row.querySelector('[data-edit-input]')
    const button = row.querySelector('[data-edit-toggle]')
    const label = row.querySelector('dt').textContent

    const close = () => {
      input.hidden = true
      value.hidden = false
      input.removeAttribute('aria-invalid')
      button.textContent = '수정'
    }
    button.addEventListener('click', () => {
      if (input.hidden) {
        input.value = value.textContent
        input.hidden = false
        value.hidden = true
        button.textContent = '저장'
        input.focus()
        return
      }
      const next = input.value.trim()
      if (!next || (input.pattern && !new RegExp(`^(?:${input.pattern})$`).test(next))) {
        input.setAttribute('aria-invalid', 'true')
        input.focus()
        return say(infoStatus, input.dataset.error, false)
      }
      value.textContent = input.type === 'tel' ? formatPhone(next) : next
      close()
      say(infoStatus, `${label}${josa(label)} 저장되었습니다.`)
      button.focus()
    })
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') button.click()
      if (e.key === 'Escape') {
        close()
        button.focus()
      }
    })
  })

  // ── 비밀번호 변경 폼 열기/닫기
  const pwToggle = root.querySelector('[data-password-toggle]')
  if (pwToggle) {
    const form = document.getElementById(pwToggle.getAttribute('aria-controls'))
    pwToggle.addEventListener('click', () => {
      const open = form.hidden
      form.hidden = !open
      pwToggle.setAttribute('aria-expanded', String(open))
      pwToggle.textContent = open ? '닫기' : '변경'
      if (open) form.querySelector('input').focus()
    })
  }

  // ── 소셜 계정 연결 / 해제
  const socialStatus = root.querySelector('[data-social-status]')
  root.querySelectorAll('[data-social-toggle]').forEach((button) => {
    const item = button.closest('[data-social]')
    const state = item.querySelector('[data-social-state]')
    button.addEventListener('click', () => {
      const connect = button.getAttribute('aria-pressed') !== 'true'
      button.setAttribute('aria-pressed', String(connect))
      button.textContent = connect ? '연결 해제' : '연결하기'
      state.textContent = connect ? '연결됨' : '미연결'
      item.classList.toggle('mypage__social-item--on', connect)
      say(socialStatus, `${item.dataset.social} 계정 ${connect ? '연결이 완료' : '연결이 해제'}되었어요.`)
    })
  })
})
