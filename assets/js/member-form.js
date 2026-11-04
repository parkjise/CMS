// ════════════════════════════════════════════════════════════════
// MEMBER FORM — 회원 화면 전용 동작 (기획서 16 — 로그인·회원가입·이메일/비밀번호 찾기·재설정·탈퇴)
// - 공통 검사는 board-form.js. 여기서는 그 검사가 볼 data-verified 값을 바꾸는 버튼과,
//   검사 통과 뒤('board-form:valid') 화면별 결과·단계 전환만 담당
// - 목업 값 (실제 이식 시 전부 /api/public/{slug}/auth/* · /members/* API 가 담당)
//   계정 hong@email.com / bazzar1234 · 비활성 계정 stop@email.com · 휴대폰 인증번호 123456
//   이메일 찾기 성공 이름 '홍길동'
// ════════════════════════════════════════════════════════════════
document.addEventListener('includes:loaded', () => {
  const DEMO = {
    email: 'hong@email.com',
    password: 'bazzar1234',
    inactive: 'stop@email.com',
    name: '홍길동',
    code: '123456',
  }
  const LOGIN_MAX_FAIL = 5
  const LOGIN_LOCK_SEC = 30 * 60
  const PHONE_CODE_SEC = 3 * 60
  const PHONE_DAILY_MAX = 5
  const RESEND_WAIT_SEC = 60

  // 목업 상태 전환은 주소 해시로 (#expired · #reservation · #naver) — 로컬 서버가 .html 리다이렉트 때 ?쿼리를 버려서
  const hashIs = (key) => location.hash.slice(1) === key
  const pad = (n) => String(n).padStart(2, '0')
  const clock = (sec) => `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`
  // ho****@email.com — 앞 2자리 외 가림 (기획서 16.11)
  const maskEmail = (email) => {
    const [local, domain] = email.split('@')
    return `${local.slice(0, 2)}****@${domain}`
  }

  // 1초마다 남은 초를 알려주는 타이머 — 0 이 되면 onEnd
  const countdown = (sec, onTick, onEnd) => {
    let left = sec
    onTick(left)
    const id = setInterval(() => {
      left -= 1
      onTick(left)
      if (left <= 0) {
        clearInterval(id)
        onEnd?.()
      }
    }, 1000)
    return () => clearInterval(id)
  }

  const setResult = (el, message, ok) => {
    el.textContent = message
    el.classList.toggle('member-form__result--ok', Boolean(ok))
  }
  const say = (form, message, ok) => {
    const status = form.querySelector('.board-form__status')
    status.textContent = message
    status.classList.toggle('board-form__status--success', Boolean(ok))
  }

  // 검사 통과 뒤 기본 완료 처리 대신 handler 실행
  const onValid = (form, handler) => {
    form.addEventListener('board-form:valid', (e) => {
      e.preventDefault()
      handler()
    })
  }

  // 단계 전환: 같은 section 안의 [data-step] 중 name 만 보이고 그 패널로 초점 이동
  const showStep = (scope, name) => {
    let shown
    scope.querySelectorAll('[data-step]').forEach((step) => {
      step.hidden = step.dataset.step !== name
      if (!step.hidden) shown = step
    })
    const target = shown.matches('form') ? shown.querySelector('input') : shown
    target.focus({ preventScroll: true })
    shown.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  // ── 찾기 탭: data-current 와 같은 data-key 에 aria-current
  document.querySelectorAll('.member-form__tabs').forEach((tabs) => {
    tabs.querySelectorAll('.member-form__tab').forEach((tab) => {
      if (tab.dataset.key === tabs.dataset.current) tab.setAttribute('aria-current', 'page')
    })
  })

  // ── 비밀번호 보기 / 숨기기
  document.querySelectorAll('[data-pw-toggle]').forEach((button) => {
    const input = button.previousElementSibling
    const icon = button.querySelector('i')
    button.addEventListener('click', () => {
      const show = input.type === 'password'
      input.type = show ? 'text' : 'password'
      button.setAttribute('aria-pressed', String(show))
      button.setAttribute('aria-label', show ? '비밀번호 숨기기' : '비밀번호 보기')
      icon.className = show ? 'ri-eye-off-line' : 'ri-eye-line'
    })
    input.form?.addEventListener('board-form:reset', () => {
      if (input.type === 'text') button.click()
    })
  })

  // ── 비밀번호 조건 표시 (8자 이상 · 영문 · 숫자)
  const RULES = {
    length: (v) => v.length >= 8,
    letter: (v) => /[A-Za-z]/.test(v),
    digit: (v) => /[0-9]/.test(v),
  }
  document.querySelectorAll('[data-pw-rules]').forEach((list) => {
    const input = list.closest('.board-form__row').querySelector('[data-pw-input]')
    const update = () => {
      list.querySelectorAll('[data-rule]').forEach((rule) => {
        const ok = RULES[rule.dataset.rule](input.value)
        rule.classList.toggle('member-form__rule--ok', ok)
        rule.querySelector('[data-rule-state]').textContent = ok ? ' 충족' : ' 미충족'
      })
    }
    input.addEventListener('input', update)
    input.form?.addEventListener('board-form:reset', update)
  })

  // ── 이메일 중복 확인 — 입력이 멈추고 1초 뒤(또는 칸을 벗어날 때) 자동 확인
  document.querySelectorAll('[data-email-check]').forEach((input) => {
    const result = input.closest('.board-form__row').querySelector('[data-email-result]')
    const pendingMessage = input.dataset.errorVerify
    let timer

    const check = () => {
      clearTimeout(timer)
      const value = input.value.trim().toLowerCase()
      if (!value || input.validity.typeMismatch) return setResult(result, '', false)
      if (value === DEMO.email) {
        input.dataset.errorVerify = '이미 사용 중인 이메일입니다.'
        return setResult(result, '이미 사용 중인 이메일입니다.', false)
      }
      input.dataset.verified = 'true'
      setResult(result, '사용 가능한 이메일입니다.', true)
    }
    const reset = () => {
      clearTimeout(timer)
      input.dataset.verified = 'false'
      input.dataset.errorVerify = pendingMessage
      setResult(result, '', false)
    }

    input.addEventListener('input', () => {
      reset()
      timer = setTimeout(check, 1000)
    })
    input.addEventListener('blur', () => {
      if (input.dataset.verified === 'false') check()
    })
    input.form.addEventListener('board-form:reset', reset)
  })

  // ── 휴대폰 인증: 인증번호 받기(3분) → 확인 / 1일 5회 · 오입력 5회 제한
  document.querySelectorAll('[data-phone-verify]').forEach((box) => {
    const phone = box.querySelector('[data-phone-input]')
    const code = box.querySelector('[data-phone-code]')
    const send = box.querySelector('[data-phone-send]')
    const confirm = box.querySelector('[data-phone-confirm]')
    const timer = box.querySelector('[data-phone-timer]')
    const result = box.querySelector('[data-phone-result]')
    let sent = false
    let sendCount = 0
    let wrong = 0
    let stopTimer = () => {}

    const lock = (locked) => {
      phone.readOnly = locked
      code.readOnly = locked
      send.disabled = locked
      confirm.disabled = locked
    }
    const reset = () => {
      stopTimer()
      sent = false
      wrong = 0
      timer.hidden = true
      code.dataset.verified = 'false'
      send.textContent = '인증번호 받기'
      lock(false)
      setResult(result, '', false)
    }

    send.addEventListener('click', () => {
      const value = phone.value.trim()
      if (!/^01[0-9]{8,9}$/.test(value)) {
        setResult(result, '휴대폰 번호를 정확히 입력한 뒤 인증번호를 받아 주세요.', false)
        phone.focus()
        return
      }
      if (sendCount >= PHONE_DAILY_MAX) {
        setResult(result, `오늘 인증 요청 횟수(${PHONE_DAILY_MAX}회)를 모두 사용했어요. 내일 다시 시도해 주세요.`, false)
        return
      }
      sendCount += 1
      sent = true
      wrong = 0
      code.value = ''
      send.textContent = '재발송'
      timer.hidden = false
      stopTimer()
      stopTimer = countdown(
        PHONE_CODE_SEC,
        (left) => {
          timer.textContent = clock(left)
        },
        () => {
          sent = false
          timer.hidden = true
          setResult(result, '인증 시간이 지났어요. 인증번호를 다시 받아 주세요.', false)
        },
      )
      setResult(result, `인증번호를 보냈어요. 3분 안에 입력해 주세요. (목업 인증번호: ${DEMO.code})`, true)
      code.focus()
    })

    confirm.addEventListener('click', () => {
      if (!sent) return setResult(result, '먼저 인증번호를 받아 주세요.', false)
      if (code.value.trim() !== DEMO.code) {
        wrong += 1
        if (wrong >= 5) {
          stopTimer()
          sent = false
          timer.hidden = true
          return setResult(result, '인증번호를 5회 잘못 입력했어요. 인증번호를 다시 받아 주세요.', false)
        }
        return setResult(result, `인증번호가 일치하지 않아요. (${wrong}/5회)`, false)
      }
      stopTimer()
      timer.hidden = true
      code.dataset.verified = 'true'
      code.removeAttribute('aria-invalid')
      lock(true)
      setResult(result, '휴대폰 인증이 완료되었어요.', true)
    })

    // 번호를 바꾸면 보낸 인증번호는 무효
    phone.addEventListener('input', () => {
      if (sent) reset()
    })
    code.addEventListener('input', () => {
      code.dataset.verified = 'false'
    })
    phone.form.addEventListener('board-form:reset', reset)
  })

  // ── 약관 전체 동의 ↔ 개별 동의
  document.querySelectorAll('[data-agree-group]').forEach((group) => {
    const all = group.querySelector('[data-agree-all]')
    const items = [...group.querySelectorAll('input[type="checkbox"]')].filter((box) => box !== all)
    all.addEventListener('change', () => {
      items.forEach((box) => {
        box.checked = all.checked
      })
    })
    items.forEach((box) =>
      box.addEventListener('change', () => {
        all.checked = items.every((item) => item.checked)
      }),
    )
    group.closest('form').addEventListener('board-form:reset', () => {
      all.checked = false
    })
  })

  // ── 로그인: 불일치 · 비활성 · 5회 실패 30분 잠금 (기획서 16.4)
  document.querySelectorAll('form[data-login]').forEach((form) => {
    const submit = form.querySelector('[type="submit"]')
    const label = submit.textContent
    let fail = 0

    onValid(form, () => {
      const email = form.elements.email.value.trim().toLowerCase()
      const password = form.elements.password.value

      if (email === DEMO.inactive) {
        return say(form, '사용이 중단된 계정입니다. 고객센터에 문의해 주세요.', false)
      }
      if (email === DEMO.email && password === DEMO.password) {
        fail = 0
        say(form, '로그인되었습니다. 마이페이지로 이동합니다.', true)
        setTimeout(() => location.assign('mypage.html'), 1000)
        return
      }

      fail += 1
      form.elements.password.value = ''
      form.elements.password.focus()
      if (fail < LOGIN_MAX_FAIL) {
        return say(form, `이메일 또는 비밀번호를 확인해 주세요. (${fail}/${LOGIN_MAX_FAIL}회 실패)`, false)
      }
      say(form, `로그인을 ${LOGIN_MAX_FAIL}회 실패해 30분 동안 로그인할 수 없어요. 잠시 후 다시 시도해 주세요.`, false)
      submit.disabled = true
      countdown(
        LOGIN_LOCK_SEC,
        (left) => {
          submit.textContent = `${clock(left)} 후 다시 시도`
        },
        () => {
          fail = 0
          submit.disabled = false
          submit.textContent = label
          say(form, '', false)
        },
      )
    })
  })

  // ── 소셜 신규 가입: #naver | #kakao 문구·아이콘
  const providerName = document.querySelector('[data-provider-name]')
  if (providerName && hashIs('naver')) {
    providerName.textContent = '네이버'
    const icon = document.querySelector('[data-provider-icon]')
    icon.closest('.member-form__badge').classList.add('member-form__badge--naver')
    icon.outerHTML = '<span>N</span>'
  }

  // ── 이메일 찾기: 이름 + 휴대폰 인증 → 찾음 / 없음 (기획서 16.5)
  document.querySelectorAll('form[data-find-email]').forEach((form) => {
    const scope = form.closest('section')
    onValid(form, () => {
      const found = form.elements.name.value.trim() === DEMO.name
      if (found) scope.querySelector('[data-found-email]').textContent = maskEmail(DEMO.email)
      showStep(scope, found ? 'found' : 'none')
    })
    scope.querySelector('[data-step-back]').addEventListener('click', () => showStep(scope, 'form'))
  })

  // ── 비밀번호 찾기: 이메일 + 휴대폰 인증 → 링크 발송 완료, 60초 뒤 재발송 (기획서 16.6)
  document.querySelectorAll('form[data-find-pw]').forEach((form) => {
    const scope = form.closest('section')
    const resend = scope.querySelector('[data-resend]')
    const resendStatus = scope.querySelector('[data-resend-status]')
    let stopWait = () => {}

    const wait = () => {
      stopWait()
      resend.disabled = true
      stopWait = countdown(
        RESEND_WAIT_SEC,
        (left) => {
          resend.textContent = `재발송하기 (${left}초)`
        },
        () => {
          resend.disabled = false
          resend.textContent = '재발송하기'
        },
      )
    }

    onValid(form, () => {
      // 계정 유무와 관계없이 같은 화면 (존재 여부 노출 방지)
      scope.querySelector('[data-sent-email]').textContent = maskEmail(form.elements.email.value.trim())
      showStep(scope, 'sent')
      wait()
    })
    resend.addEventListener('click', () => {
      resendStatus.textContent = '재설정 링크를 다시 보냈어요.'
      wait()
    })
  })

  // ── 새 비밀번호 설정: 변경 완료 → 3초 뒤 로그인 / #expired 면 만료 화면 (기획서 16.6)
  document.querySelectorAll('form[data-reset-pw]').forEach((form) => {
    const scope = form.closest('section')
    if (hashIs('expired')) showStep(scope, 'expired')

    onValid(form, () => {
      showStep(scope, 'done')
      const count = scope.querySelector('[data-countdown]')
      countdown(
        3,
        (left) => {
          count.textContent = left
        },
        () => location.assign('login.html'),
      )
    })
  })

  // ── 회원 탈퇴: 기타 사유 칸 · 진행 중 예약 차단 · 비밀번호 확인 (기획서 16.8)
  document.querySelectorAll('form[data-withdraw]').forEach((form) => {
    const scope = form.closest('section')
    const reason = form.querySelector('[data-reason]')
    const etc = form.querySelector('[data-reason-etc]')
    const block = form.querySelector('[data-active-reservation]')
    const hasReservation = hashIs('reservation')
    block.hidden = !hasReservation

    reason.addEventListener('change', () => {
      etc.hidden = reason.value !== 'etc'
      if (!etc.hidden) etc.focus()
    })

    onValid(form, () => {
      if (hasReservation) {
        say(form, '진행 중인 예약이 있어 탈퇴할 수 없어요. 예약을 취소한 뒤 다시 시도해 주세요.', false)
        block.querySelector('a').focus()
        return
      }
      if (form.elements.password.value !== DEMO.password) {
        form.elements.password.setAttribute('aria-invalid', 'true')
        form.elements.password.focus()
        return say(form, '비밀번호가 일치하지 않습니다.', false)
      }
      showStep(scope, 'done')
    })
  })
})
