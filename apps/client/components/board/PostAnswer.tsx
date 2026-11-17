import { postDate } from '@/lib/publicPosts'

interface PostAnswerClasses {
  root: string
  title: string
  date: string
  text: string
}

interface PostAnswerProps {
  answer?: string | null
  answeredAt?: string | null
  /** 날짜 글자 — 템플릿마다 형식이 다르다 */
  formatDate: (date: string) => string
  classes: PostAnswerClasses
}

/** 문의형 관리자 답변 (T-219) — 글자만, 빈 줄로 문단. 템플릿마다 classes 로 모양을 맞춘다 */
export const PostAnswer = ({ answer, answeredAt, formatDate, classes }: PostAnswerProps) => {
  if (!answer) return null
  const date = answeredAt ? postDate(answeredAt) : null
  return (
    <section className={classes.root} aria-label="관리자 답변">
      <h3 className={classes.title}>답변</h3>
      {date && (
        <time className={classes.date} dateTime={date}>
          {formatDate(date)}
        </time>
      )}
      {answer.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index} className={classes.text}>
          {paragraph}
        </p>
      ))}
    </section>
  )
}
