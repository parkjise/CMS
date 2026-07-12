import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import nextPlugin from '@next/eslint-plugin-next'
import globals from 'globals'

export default tseslint.config(
  // 무시 경로 (빌드 산출물·설정 파일·의존성)
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/build/**',
      '**/.vite/**',
      '**/playwright-report/**',
      '**/*.config.{js,ts,mjs,cjs}',
      '**/vite-env.d.ts',
      '**/next-env.d.ts',
    ],
  },

  // 기본 JS + TypeScript 권장 규칙
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // React (Vite 앱 + 공통 UI 패키지)
  {
    files: [
      'apps/admin/**/*.{ts,tsx}',
      'apps/superadmin/**/*.{ts,tsx}',
      'packages/ui/**/*.{ts,tsx}',
    ],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Next.js 고객 홈페이지
  {
    files: ['apps/client/**/*.{ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,
      // App Router 전용 프로젝트 — pages 디렉토리 링크 규칙 비활성
      '@next/next/no-html-link-for-pages': 'off',
    },
  },

  // 공통 규칙 조정 (실사용 코드베이스에 맞춘 실용적 강도)
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // 테스트/E2E 파일: 브라우저+노드 전역 허용
  {
    files: ['**/*.{test,spec}.{ts,tsx}', 'apps/client/e2e/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  }
)
