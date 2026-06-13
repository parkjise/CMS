interface CharCounterProps {
  current: number
  max: number
}

export function CharCounter({ current, max }: CharCounterProps) {
  const over = current > max
  return (
    <span
      className={`text-xs ${over ? 'font-medium text-rose-600' : 'text-slate-400'}`}
      aria-live="polite"
    >
      {current}/{max}
    </span>
  )
}
