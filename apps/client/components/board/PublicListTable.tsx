import type { BoardColumnSize, PublicFieldValue, PublicListColumn } from '@cms/types'
import { fieldValueText } from '@/lib/publicPosts'
import { AttachmentMark } from './AttachmentMark'

export interface PublicTableRow {
  id: string
  title: string
  date: string
  pinned?: boolean
  secret?: boolean
  /** 첨부 파일이 있는 글 (T-197) */
  attachment?: boolean
  fields?: PublicFieldValue[] | null
}
interface PublicListTableProps {
  rows: PublicTableRow[]
  columns: PublicListColumn[]
  showDate: boolean
  hrefFor: (extra: { id: string }) => string
  classes: {
    sizes: Record<BoardColumnSize, string>
    scroll: string
    table: string
    head: string
    cell: string
    title: string
    link: string
    badge: string
    date: string
  }
}

/** 템플릿이 스타일을 제공하는 공개 목록 표. 비밀글의 값은 응답에 있어도 표시하지 않는다. */
export const PublicListTable = ({
  rows,
  columns,
  showDate,
  hrefFor,
  classes: c,
}: PublicListTableProps) => (
  <div role="region" aria-label="게시글 표" tabIndex={0} className={c.scroll}>
    <table aria-label="게시글과 추가 정보" className={c.table}>
      <thead>
        <tr>
          <th scope="col" className={`${c.head} ${c.title}`}>
            제목
          </th>
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              className={`${c.head} ${c.sizes[column.size ?? 'normal']}`}
            >
              {column.label}
            </th>
          ))}
          {showDate && (
            <th scope="col" className={`${c.head} ${c.date}`}>
              작성일
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td className={`${c.cell} ${c.title}`}>
              <a className={c.link} href={hrefFor({ id: row.id })}>
                {row.pinned && <span className={c.badge}>공지</span>}
                {row.secret && <span className={c.badge}>비밀글</span>}
                {row.title}
                {row.attachment && <AttachmentMark />}
              </a>
            </td>
            {columns.map((column) => {
              const value = row.secret
                ? undefined
                : row.fields?.find((field) => field.key === column.key)
              return (
                <td key={column.key} className={`${c.cell} ${c.sizes[column.size ?? 'normal']}`}>
                  {value ? (
                    value.field_type === 'IMAGE' ? (
                      '사진 있음'
                    ) : (
                      fieldValueText(value)
                    )
                  ) : (
                    <span aria-label="값 없음">—</span>
                  )}
                </td>
              )
            })}
            {showDate && (
              <td className={`${c.cell} ${c.date}`}>
                <time dateTime={row.date}>{row.date.replaceAll('-', '.')}</time>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)
