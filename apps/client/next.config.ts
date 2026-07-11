import path from 'node:path'
import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV !== 'production'

const nextConfig: NextConfig = {
  // 프로덕션 Docker 이미지 경량화: 최소 node_modules만 포함한 standalone 서버 출력
  output: 'standalone',
  // pnpm 모노레포: 워크스페이스 루트 기준으로 파일 트레이싱 (워크스페이스 의존성 포함)
  outputFileTracingRoot: path.join(__dirname, '../../'),
  images: {
    remotePatterns: [
      // 로컬 MinIO
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '9000',
        pathname: '/**',
      },
      // 프로덕션 MinIO CDN (환경변수로 관리)
      ...(process.env.NEXT_PUBLIC_CDN_HOSTNAME
        ? [
            {
              protocol: 'https' as const,
              hostname: process.env.NEXT_PUBLIC_CDN_HOSTNAME,
              pathname: '/**',
            },
          ]
        : []),
      // 개발 편의: 외부 이미지 URL(예: unsplash, picsum) 허용
      // TODO(prod): 운영 환경에서는 실제 사용하는 도메인 목록으로 잠글 것
      ...(isDev
        ? [
            { protocol: 'https' as const, hostname: '**' },
            { protocol: 'http' as const, hostname: '**' },
          ]
        : []),
    ],
  },
  // 서버 컴포넌트에서 외부 패키지 최적화
  serverExternalPackages: [],
}

export default nextConfig
