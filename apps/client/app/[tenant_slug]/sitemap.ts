import type { MetadataRoute } from 'next'
import { fetchPublicSite } from '@/lib/publicSite'

interface Props {
  params: Promise<{ tenant_slug: string }>
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export default async function sitemap({
  params,
}: Props): Promise<MetadataRoute.Sitemap> {
  const { tenant_slug } = await params
  const site = await fetchPublicSite(tenant_slug)
  if (!site) return []

  return [
    {
      url: `${SITE_URL}/${tenant_slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ]
}
