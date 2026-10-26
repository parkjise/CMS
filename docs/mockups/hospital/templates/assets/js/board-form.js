// ════════════════════════════════════════════════════════════════
// BOARD FORM — 게시판 입력 폼 공용 검증 (온라인 예약 · 상담 글쓰기)
// - 목업용: 보안문자 6자리를 만들어 보여주고, 등록 시 필수값을 위에서부터 순서대로 검사
//   (실제 이식 시 보안문자 이미지·검증·저장은 서버 API 가 담당)
// - 마크업 약속 (.board-form__form 안):
//   required + data-error="비었을 때 문구" · minlength + data-error-short="짧을 때 문구"
//   pattern + data-error-pattern · type=email + data-error-format · data-match="#다른칸" + data-error-match
//   data-verified="false" + data-error-verify (중복확인·인증 버튼이 true 로 바꿔야 통과 — member-form.js)
//   data-digits 숫자만 입력 · data-min-today 오늘 이후 날짜만 · data-max-today 오늘까지 날짜만 (생년월일)
//   [data-captcha] 보안문자 표시 · [data-captcha-input] 보안문자 입력
//   form[data-success] 접수 완료 문구 · form[data-keep] 완료 후에도 입력값 유지 · form[data-redirect] 완료 1.5초 뒤 이동
//   검사 통과 시 취소 가능한 'board-form:valid' 이벤트 — 화면별 스크립트가 preventDefault() 하면
//   기본 완료 처리(초기화·완료 문구)를 건너뛰고 직접 결과를 보여줌 (member-form.js 로그인·찾기 단계)
// ════════════════════════════════════════════════════════════════
document.addEventListener('includes:loaded', () => {
  document.querySelectorAll('.board-form__form').forEach((form) => {
    const status = form.querySelector('.board-form__status')
    const captchaCode = form.querySelector('[data-captcha]')
    const captchaInput = form.querySelector('[data-captcha-input]')

    const newCaptcha = () => {
      if (captchaCode) captchaCode.textContent = String(Math.floor(100000 + Math.random() * 900000))
    }
    newCaptcha()

    const today = new Date()
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset())
    const todayValue = today.toISOString().slice(0, 10)
    form.querySelectorAll('[data-min-today]').forEach((field) => {
      field.min = todayValue
    })
    form.querySelectorAll('[data-max-today]').forEach((field) => {
      field.max = todayValue
    })

    form.querySelectorAll('[data-digits]').forEach((field) => {
      field.addEventListener('input', () => {
        field.value = field.value.replace(/[^0-9]/g, '')
      })
    })

    const showError = (field, message) => {
      status.textContent = message
      status.classList.remove('board-form__status--success')
      field.setAttribute('aria-invalid', 'true')
      field.focus()
    }

    // 비었거나 짧으면 안내 문구, 통과하면 null
    const errorOf = (field) => {
      const empty = field.type === 'checkbox' ? !field.checked : !field.value.trim()
      if (empty) return field.dataset.error
      if (field.minLength > 0 && field.value.trim().length < field.minLength) {
        return field.dataset.errorShort
      }
      if (field.pattern && !new RegExp(`^(?:${field.pattern})$`).test(field.value)) {
        return field.dataset.errorPattern
      }
      if (field.type === 'email' && field.validity.typeMismatch) return field.dataset.errorFormat
      if (field.dataset.match && field.value !== form.querySelector(field.dataset.match).value) {
        return field.dataset.errorMatch
      }
      if (field.dataset.verified === 'false') return field.dataset.errorVerify
      if (field === captchaInput && field.value.trim() !== captchaCode.textContent) {
        newCaptcha()
        field.value = ''
        return '보안문자가 일치하지 않습니다. 새 보안문자를 입력해 주세요.'
      }
      return null
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault()
      form.querySelectorAll('[aria-invalid]').forEach((field) => field.removeAttribute('aria-invalid'))

      for (const field of form.querySelectorAll('[required]')) {
        const message = errorOf(field)
        if (message) return showError(field, message)
      }

      if (!form.dispatchEvent(new CustomEvent('board-form:valid', { cancelable: true }))) return

      if (!('keep' in form.dataset)) {
        form.reset()
        newCaptcha()
        form.dispatchEvent(new CustomEvent('board-form:reset'))
      }
      status.textContent = form.dataset.success
      status.classList.add('board-form__status--success')
      if (form.dataset.redirect) setTimeout(() => location.assign(form.dataset.redirect), 1500)
    })
  })
})
