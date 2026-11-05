import { Fragment, type CSSProperties, type ReactNode } from 'react'
import type { BodyBlock, BodyNode, RichNode } from '@cms/types'
import { RichLine } from './RichLine'

/**
 * 글 본문을 태그로 그린다 (T-143) — 서버가 허용 목록으로 검사한 값이지만 여기서도 알려진 노드 · 안전한
 * 주소만 그린다. HTML 을 그대로 넣지 않으므로 고객 입력이 마크업으로 해석되지 않는다.
 * 이전 형식(p · ul · image)도 그린다 — 기존 글 · 샘플.
 */
const SAFE_LINK = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i
const SAFE_IMAGE = /^(https?:\/\/|\/(?!\/))/i
const SAFE_COLOR = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))$/i
const ALIGNS = new Set(['left', 'center', 'right'])

const alignStyle = (node: RichNode): CSSProperties | undefined => {
  const align = node.attrs?.textAlign
  return typeof align === 'string' && ALIGNS.has(align)
    ? { textAlign: align as CSSProperties['textAlign'] }
    : undefined
}

const spanOf = (value: unknown): number | undefined =>
  typeof value === 'number' && value > 1 ? value : undefined

function Text({ node }: { node: RichNode }) {
  let out: ReactNode = node.text ?? ''
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') out = <strong>{out}</strong>
    else if (mark.type === 'italic') out = <em>{out}</em>
    else if (mark.type === 'underline') out = <u>{out}</u>
    else if (mark.type === 'strike') out = <s>{out}</s>
    else if (mark.type === 'textStyle') {
      const color = mark.attrs?.color
      if (typeof color === 'string' && SAFE_COLOR.test(color)) out = <span style={{ color }}>{out}</span>
    } else if (mark.type === 'link') {
      const href = mark.attrs?.href
      if (typeof href === 'string' && SAFE_LINK.test(href)) {
        out = (
          <a href={href} target="_blank" rel="noopener noreferrer nofollow">
            {out}
          </a>
        )
      }
    }
  }
  return <>{out}</>
}

const children = (node: RichNode): ReactNode =>
  (node.content ?? []).map((child, i) => <Node key={i} node={child} />)

function Image({ src, alt }: { src: unknown; alt: unknown }) {
  if (typeof src !== 'string' || !SAFE_IMAGE.test(src)) return null
  return (
    <figure>
      {/* eslint-disable-next-line @next/next/no-img-element -- 고객이 올린 글 사진 */}
      <img src={src} alt={typeof alt === 'string' ? alt : ''} loading="lazy" />
    </figure>
  )
}

function Node({ node }: { node: RichNode }) {
  switch (node.type) {
    case 'text':
      return <Text node={node} />
    case 'hardBreak':
      return <br />
    case 'paragraph':
      return <p style={alignStyle(node)}>{children(node)}</p>
    case 'heading':
      return node.attrs?.level === 3 ? (
        <h3 style={alignStyle(node)}>{children(node)}</h3>
      ) : (
        <h2 style={alignStyle(node)}>{children(node)}</h2>
      )
    case 'bulletList':
      return <ul>{children(node)}</ul>
    case 'orderedList':
      return <ol start={spanOf(node.attrs?.start)}>{children(node)}</ol>
    case 'listItem':
      return <li>{children(node)}</li>
    case 'blockquote':
      return <blockquote>{children(node)}</blockquote>
    case 'horizontalRule':
      return <hr />
    case 'image':
      return <Image src={node.attrs?.src} alt={node.attrs?.alt} />
    case 'table':
      return (
        <div data-table-scroll>
          <table>
            <tbody>{children(node)}</tbody>
          </table>
        </div>
      )
    case 'tableRow':
      return <tr>{children(node)}</tr>
    case 'tableHeader':
      return (
        <th colSpan={spanOf(node.attrs?.colspan)} rowSpan={spanOf(node.attrs?.rowspan)}>
          {children(node)}
        </th>
      )
    case 'tableCell':
      return (
        <td colSpan={spanOf(node.attrs?.colspan)} rowSpan={spanOf(node.attrs?.rowspan)}>
          {children(node)}
        </td>
      )
    default:
      return null
  }
}

function Legacy({ block }: { block: BodyBlock }) {
  if (block.type === 'image') return <Image src={block.src} alt={block.alt} />
  if (block.type === 'ul') {
    return (
      <ul>
        {block.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    )
  }
  return (
    <p>
      <RichLine text={block.text} />
    </p>
  )
}

const isLegacy = (node: BodyNode): node is BodyBlock =>
  node.type === 'p' || node.type === 'ul' || (node.type === 'image' && 'src' in node)

/** 본문 노드 목록 — 감싸는 태그 · 스타일은 템플릿이 정한다 */
export function RichBody({ nodes }: { nodes: BodyNode[] }) {
  return (
    <>
      {nodes.map((node, i) => (
        <Fragment key={i}>{isLegacy(node) ? <Legacy block={node} /> : <Node node={node} />}</Fragment>
      ))}
    </>
  )
}
