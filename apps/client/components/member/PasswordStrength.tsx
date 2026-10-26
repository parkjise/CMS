import { passwordChecks } from '@/lib/memberSchemas'

interface PasswordStrengthProps {
  value: string
}

const ITEMS = [
  ['length', '8자 이상'],
  ['letter', '영문'],
  ['digit', '숫자'],
] as const

/** 비밀번호 강도 — ✅ 8자↑ ✅ 영문 ✅ 숫자 (기획서 16.3) */
const PasswordStrength = ({ value }: PasswordStrengthProps) => {
  const checks = passwordChecks(value)
  return (
    <ul className="flex gap-3 text-xs" aria-label="비밀번호 조건">
      {ITEMS.map(([key, label]) => (
        <li
          key={key}
          data-ok={checks[key]}
          className={checks[key] ? 'text-emerald-600' : 'text-[color:var(--color-text-subtle)]'}
        >
          {checks[key] ? '✓' : '·'} {label}
        </li>
      ))}
    </ul>
  )
}

export default PasswordStrength
