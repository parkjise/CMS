import { RichLine } from '../../../shared/RichLine'

// 굵게 · 줄바꿈 표기 글자 — 목록 글자 인라인 편집(TemplateListText)도 쓰므로 shared 로 옮김 (T-125-E)
export { RichLine }

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
