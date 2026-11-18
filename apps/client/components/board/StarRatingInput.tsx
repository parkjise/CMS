'use client'

const STARS = [1, 2, 3, 4, 5] as const

interface StarRatingClasses {
  root: string
  legend: string
  /** 필수 표시(*) — 폼의 다른 필수 칸과 같은 모양 */
  req?: string
  stars: string
  /** 라디오는 숨기고 별 글자로 보여 준다 — 키보드 · 화면낭독기는 라디오로 */
  input: string
  star: string
  starOn: string
  error: string
}

interface StarRatingInputProps {
  id: string
  value: number
  error?: string
  classes: StarRatingClasses
  onChange: (value: number) => void
}

/** 리뷰형 글쓰기의 별점 1~5 (T-218) — 템플릿마다 classes 로 모양을 맞춘다 */
export const StarRatingInput = ({ id, value, error, classes, onChange }: StarRatingInputProps) => (
  <fieldset className={classes.root} aria-invalid={error ? true : undefined}>
    <legend className={classes.legend}>
      별점
      <span className={classes.req} aria-hidden="true">
        *
      </span>
    </legend>
    <div className={classes.stars}>
      {STARS.map((n) => (
        <label key={n} htmlFor={`${id}-${n}`}>
          <input
            className={classes.input}
            type="radio"
            id={`${id}-${n}`}
            name={id}
            value={n}
            checked={value === n}
            aria-label={`${n}점`}
            onChange={() => onChange(n)}
          />
          <span
            aria-hidden="true"
            className={n <= value ? `${classes.star} ${classes.starOn}` : classes.star}
          >
            ★
          </span>
        </label>
      ))}
    </div>
    {error && <p className={classes.error}>{error}</p>}
  </fieldset>
)
