import { Fragment } from 'react'

/**
 * 문단 문자열 표시 — 줄바꿈(\n)은 <br />, **굵게**는 <strong>.
 * HTML 을 그대로 넣지 않으므로 고객 입력이 마크업으로 해석되지 않는다.
 */
export function RichLine({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
  return (
    <>
      {parts.map((part, i) => {
        const bold = part.startsWith('**') && part.endsWith('**')
        const body = bold ? part.slice(2, -2) : part
        const lines = body.split('\n')
        const content = lines.map((line, j) => (
          <Fragment key={j}>
            {/* 줄바꿈 뒤 공백: 좁은 화면에서 <br> 을 숨겨도(.story-text__desc br) 단어가 붙지 않게 — 목업 HTML 과 동일 */}
            {j > 0 && (
              <>
                <br />
                {'\n'}
              </>
            )}
            {line}
          </Fragment>
        ))
        return bold ? <strong key={i}>{content}</strong> : <Fragment key={i}>{content}</Fragment>
      })}
    </>
  )
}

/** 문단 목록 → <p> 여러 개 */
export function RichParagraphs({ paragraphs }: { paragraphs: string[] }) {
  return (
    <>
      {paragraphs.map((p, i) => (
        <p key={i}>
          <RichLine text={p} />
        </p>
      ))}
    </>
  )
}
