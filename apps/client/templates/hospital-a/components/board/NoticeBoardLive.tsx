import { NOTICE_BOARD, fetchPublicPost, fetchPublicPosts, postDate } from '@/lib/publicPosts'
import { getPlainString } from '@/lib/sectionSettings'
import { NoticeBoard, type NoticeBoardProps, NoticeDetailView, NoticeListView } from './NoticeBoard'

/**
 * 실제 사업체의 공지 — 공개 글이 있으면 게시글, 없으면 샘플(섹션 JSON) (게시판 모듈 기획서 2.2)
 * 글을 처음 공개하면 서버가 샘플을 비우므로, 글을 다 지워도 샘플이 돌아오지 않는다.
 */
export async function NoticeBoardLive(props: NoticeBoardProps) {
  const { section, tenantSlug, detailId, q, page, hrefFor, searchTarget } = props

  if (detailId) {
    const post = await fetchPublicPost(tenantSlug, NOTICE_BOARD, detailId)
    if (!post) return <NoticeBoard {...props} />
    return (
      <NoticeDetailView
        subject={post.title}
        date={postDate(post.published_at)}
        body={post.body}
        fields={post.fields}
        attachments={post.attachments}
        edit={{ board: NOTICE_BOARD, post: post.id }}
        prevHref={post.prev_id ? hrefFor({ id: post.prev_id }) : null}
        nextHref={post.next_id ? hrefFor({ id: post.next_id }) : null}
        listHref={hrefFor()}
      />
    )
  }

  const keyword = (q ?? '').trim()
  const load = (p: number) =>
    fetchPublicPosts(tenantSlug, NOTICE_BOARD, { page: p, q: keyword || undefined })
  let list = await load(page)
  if (!list?.has_posts) return <NoticeBoard {...props} />

  const totalPages = Math.max(1, Math.ceil(list.total / list.size))
  // 지난 주소의 페이지가 사라졌으면 마지막 페이지로
  if (page > totalPages) list = (await load(totalPages)) ?? list

  return (
    <NoticeListView
      title={getPlainString(section.settings, 'title')}
      items={list.items.map((p) => ({
        id: p.id,
        subject: p.title,
        date: postDate(p.published_at),
        pinned: p.is_pinned,
        attachment: p.has_attachments,
      }))}
      total={list.total}
      page={Math.min(page, totalPages)}
      totalPages={totalPages}
      keyword={keyword}
      hrefFor={hrefFor}
      searchTarget={searchTarget}
      canWrite
    />
  )
}
