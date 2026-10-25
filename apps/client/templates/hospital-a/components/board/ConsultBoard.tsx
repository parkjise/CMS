import { getJson, getString } from '@/lib/sectionSettings'
import { fetchBoardList, fetchBoardPost, type BoardList, type BoardPost } from '@/lib/publicBoard'
import type { CodeSectionProps } from '../../../shared/contracts'
import { BoardToolbar, type SearchTarget } from './BoardToolbar'
import { ConsultPostView } from './ConsultPostView'
import { ConsultUnlock } from './ConsultUnlock'
import { ConsultWrite } from './ConsultWrite'
import { Pagination } from './Pagination'
import { dashDateTime } from './format'

type SamplePost = Omit<BoardPost, 'locked' | 'prev_id' | 'next_id'>

interface Props extends CodeSectionProps {
  brandName: string
  detailId?: string
  q?: string
  page: number
  hrefFor: (extra?: { id?: string; q?: string; p?: number }) => string
  searchTarget: SearchTarget
}

const PAGE_SIZE = 10

/** 샘플 섹션(테넌트 데이터 아님)이면 설정의 sample_posts 로 화면만 보여준다 — 미리보기용 */
function samplePosts(section: CodeSectionProps['section']): SamplePost[] {
  return getJson<SamplePost[]>(section.settings, 'sample_posts', [])
}

function sampleList(posts: SamplePost[], page: number, q: string): BoardList {
  const filtered = q ? posts.filter((p) => p.subject.includes(q)) : posts
  const items = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((p, i) => ({
    id: p.id,
    no: filtered.length - (page - 1) * PAGE_SIZE - i,
    subject: p.subject,
    author: p.author,
    is_secret: p.is_secret,
    answered: p.answered,
    created_at: p.created_at,
  }))
  return { total: filtered.length, page, size: PAGE_SIZE, items }
}

function sampleDetail(posts: SamplePost[], id: string): BoardPost | null {
  const index = posts.findIndex((p) => p.id === id)
  if (index < 0) return null
  return {
    ...posts[index],
    locked: false,
    prev_id: posts[index + 1]?.id ?? null,
    next_id: posts[index - 1]?.id ?? null,
  }
}

/**
 * 온라인 상담 — 목업 sub/consult-board.html · consult-view.html · consult-write.html (BOARD board=consult)
 * 목록·상세는 공개 상담 API, 글쓰기는 /{slug}/consult/write. 설정 키: title (인라인 편집 아님)
 */
export async function ConsultBoard({
  section,
  editable,
  tenantSlug,
  brandName,
  detailId,
  q,
  page,
  hrefFor,
  searchTarget,
}: Props) {
  const useSample = !editable
  const posts = useSample ? samplePosts(section) : []
  const listHref = hrefFor()

  if (detailId === 'write') {
    return (
      <ConsultWrite tenantSlug={tenantSlug} listHref={listHref} detailHrefTemplate={hrefFor({ id: '__ID__' })} />
    )
  }

  if (detailId) {
    const post = useSample ? sampleDetail(posts, detailId) : await fetchBoardPost(tenantSlug, detailId)
    if (!post) {
      return (
        <section className="consult-board" aria-label="온라인 상담">
          <div className="page-container">
            <p className="board-list__empty">게시글을 찾을 수 없습니다.</p>
          </div>
        </section>
      )
    }
    const prevHref = post.prev_id ? hrefFor({ id: post.prev_id }) : null
    const nextHref = post.next_id ? hrefFor({ id: post.next_id }) : null
    return post.locked ? (
      <ConsultUnlock tenantSlug={tenantSlug} post={post} brandName={brandName} prevHref={prevHref} nextHref={nextHref} listHref={listHref} />
    ) : (
      <ConsultPostView post={post} brandName={brandName} prevHref={prevHref} nextHref={nextHref} listHref={listHref} />
    )
  }

  const keyword = (q ?? '').trim()
  const list = useSample
    ? sampleList(posts, page, keyword)
    : ((await fetchBoardList(tenantSlug, { page, size: PAGE_SIZE, q: keyword || undefined })) ?? {
        total: 0,
        page,
        size: PAGE_SIZE,
        items: [],
      })
  const totalPages = Math.max(1, Math.ceil(list.total / PAGE_SIZE))

  return (
    <section className="consult-board" aria-labelledby="consult-board-title">
      <div className="page-container">
        <h2 className="consult-board__title" id="consult-board-title">
          {getString(section.settings, 'title')}
        </h2>
        <BoardToolbar
          total={list.total}
          q={keyword}
          label="온라인 상담 검색"
          inputId="consult-search"
          target={searchTarget}
          className="consult-board__toolbar"
        />
        <table className="consult-board__table">
          <caption className="sr-only">온라인 상담 목록 — 번호, 제목, 작성자, 답변여부, 등록일</caption>
          <colgroup>
            <col className="consult-board__col--no" />
            <col />
            <col className="consult-board__col--author" />
            <col className="consult-board__col--status" />
            <col className="consult-board__col--date" />
          </colgroup>
          <thead className="consult-board__head">
            <tr>
              <th scope="col">NO</th>
              <th scope="col">제목</th>
              <th scope="col">작성자</th>
              <th scope="col">답변여부</th>
              <th scope="col">등록일</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((item) => (
              <tr className="consult-board__row" key={item.id}>
                <td className="consult-board__no">{item.no}</td>
                <td className="consult-board__subject">
                  <a className="consult-board__link" href={hrefFor({ id: item.id })}>
                    {item.is_secret && (
                      <>
                        <i className="ri-lock-line" aria-hidden="true" />
                        <span className="sr-only">비밀글</span>
                      </>
                    )}
                    <span>{item.subject}</span>
                  </a>
                </td>
                <td className="consult-board__author">{item.author}</td>
                <td className="consult-board__status">
                  <span className={`consult-board__badge consult-board__badge--${item.answered ? 'done' : 'wait'}`}>
                    {item.answered ? '답변완료' : '답변대기'}
                  </span>
                </td>
                <td className="consult-board__date">
                  <time dateTime={item.created_at}>{dashDateTime(item.created_at)}</time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.items.length === 0 && (
          <p className="board-list__empty">{keyword ? '검색 결과가 없습니다.' : '등록된 상담 글이 없습니다.'}</p>
        )}
        <div className="consult-board__actions">
          <a className="consult-board__write" href={hrefFor({ id: 'write' })}>
            글쓰기
          </a>
        </div>
        <Pagination
          page={Math.min(page, totalPages)}
          totalPages={totalPages}
          hrefFor={(p) => hrefFor({ q: keyword || undefined, p })}
          className="consult-board__pagination"
        />
      </div>
    </section>
  )
}
