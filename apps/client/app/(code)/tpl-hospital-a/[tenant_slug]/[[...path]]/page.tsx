import type { Metadata } from 'next'
import { CodeRoutePage, codeRouteMetadata, type CodeRouteParams } from '@/templates/codeRoute'
import { hospitalAEntry } from '@/templates/hospital-a/entry'

/**
 * hospital-a 템플릿 전용 라우트 (기획서 11.11 #26) — 이 라우트에만 hospital-a 의 CSS·JS 가 묶인다.
 * 공개 주소는 /{slug}[/{page}[/{id}]] — middleware.ts 가 이 경로로 rewrite (직접 접근은 404).
 */
interface Props {
  params: Promise<CodeRouteParams>
  searchParams: Promise<{ q?: string; p?: string }>
}

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  return codeRouteMetadata(hospitalAEntry, await params)
}

export default async function HospitalARoute({ params, searchParams }: Props) {
  return <CodeRoutePage entry={hospitalAEntry} params={await params} searchParams={await searchParams} />
}
