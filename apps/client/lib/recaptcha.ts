declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void
      execute: (siteKey: string, options: { action: string }) => Promise<string>
    }
  }
}

const SCRIPT_ID = 'recaptcha-v3-sdk'
let loadPromise: Promise<void> | null = null

function loadSdk(siteKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    if (window.grecaptcha) return resolve()
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('sdk-load-failed')), {
        once: true,
      })
      return
    }
    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.async = true
    script.defer = true
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('sdk-load-failed'))
    document.head.appendChild(script)
  })

  return loadPromise
}

/**
 * reCAPTCHA v3 토큰을 발급한다.
 * - siteKey 미설정 또는 SDK 로드 실패 시 null 반환 (개발/오프라인 환경)
 * - 백엔드는 secret 미설정 시 토큰 없이도 통과하므로 호환됨
 */
export async function executeRecaptcha(
  siteKey: string | undefined,
  action = 'submit',
): Promise<string | null> {
  if (!siteKey) return null
  try {
    await loadSdk(siteKey)
    if (!window.grecaptcha) return null
    return await new Promise<string>((resolve, reject) => {
      window.grecaptcha?.ready(() => {
        window.grecaptcha?.execute(siteKey, { action }).then(resolve, reject)
      })
    })
  } catch {
    return null
  }
}
