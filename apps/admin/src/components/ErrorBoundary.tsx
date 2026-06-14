import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@cms/ui'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 개발 모드에선 콘솔에 스택 출력. 운영에선 외부 로깅 서비스 연동 자리.
    console.error('[ErrorBoundary]', error, info)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  handleReload = () => {
    window.location.reload()
  }

  handleHome = () => {
    window.location.href = '/admin/dashboard'
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="mb-2 text-xl font-bold text-slate-900">
            예상치 못한 오류가 발생했습니다
          </h1>
          <p className="mb-6 text-sm text-slate-500">
            잠시 후 다시 시도해주세요. 문제가 계속되면 새로고침하거나 처음 화면으로
            돌아가주세요.
          </p>

          {import.meta.env.DEV && this.state.error && (
            <pre className="mb-6 max-h-40 overflow-auto rounded-md bg-slate-50 p-3 text-xs text-slate-600">
              {this.state.error.message}
            </pre>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={this.handleReload}>
              <RotateCcw className="h-3.5 w-3.5" />
              새로고침
            </Button>
            <Button variant="secondary" onClick={this.handleHome}>
              처음으로
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
