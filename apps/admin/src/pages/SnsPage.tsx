import { useEffect, useState } from 'react'
import {
  Facebook,
  Instagram,
  MessageCircle,
  Newspaper,
  PenSquare,
  Youtube,
} from 'lucide-react'
import { Button, toast } from '@cms/ui'
import { NotificationSettingsCard } from '@/components/sns/NotificationSettingsCard'
import { SnsChannelRow } from '@/components/sns/SnsChannelRow'
import { useNotificationSettings } from '@/hooks/useNotificationSettings'
import { useSnsSettings, useUpdateSns } from '@/hooks/useSns'

interface ChannelDraft {
  kakao_url: string
  instagram_url: string
  facebook_url: string
  youtube_url: string
  blog_url: string
  naver_url: string
}

const EMPTY: ChannelDraft = {
  kakao_url: '',
  instagram_url: '',
  facebook_url: '',
  youtube_url: '',
  blog_url: '',
  naver_url: '',
}

export function SnsPage() {
  const snsQuery = useSnsSettings()
  const updateMutation = useUpdateSns()
  const [draft, setDraft] = useState<ChannelDraft>(EMPTY)

  // 서버 응답 도착/변경 시 draft 동기화 (사용자 편집 중이 아닌 경우)
  useEffect(() => {
    if (snsQuery.data) {
      setDraft({
        kakao_url: snsQuery.data.kakao_url ?? '',
        instagram_url: snsQuery.data.instagram_url ?? '',
        facebook_url: snsQuery.data.facebook_url ?? '',
        youtube_url: snsQuery.data.youtube_url ?? '',
        blog_url: snsQuery.data.blog_url ?? '',
        naver_url: snsQuery.data.naver_url ?? '',
      })
    }
  }, [snsQuery.data])

  const notifQuery = useNotificationSettings()

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync(draft)
      toast.success('SNS 설정을 저장했습니다.')
    } catch (e) {
      const detail =
        (e as { response?: { data?: { detail?: unknown } } })?.response?.data
          ?.detail
      toast.error(typeof detail === 'string' ? detail : '저장에 실패했습니다.')
    }
  }

  const update = <K extends keyof ChannelDraft>(key: K, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">SNS · 알림 설정</h1>
        <p className="mt-1 text-sm text-slate-500">
          SNS 채널 링크를 등록하면 고객 홈페이지 푸터에 자동으로 노출됩니다.
        </p>
      </div>

      {/* SNS 채널 */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-slate-900">SNS 채널</h2>
          <span className="text-xs text-slate-500">
            토글로 활성/비활성, 변경 후 [저장] 버튼을 눌러주세요.
          </span>
        </div>

        {snsQuery.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-lg border border-slate-200 bg-white"
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <SnsChannelRow
              label="인스타그램"
              icon={Instagram}
              iconBg="bg-pink-50 text-pink-600"
              value={draft.instagram_url}
              onChange={(v) => update('instagram_url', v)}
            />
            <SnsChannelRow
              label="페이스북"
              icon={Facebook}
              iconBg="bg-blue-50 text-blue-600"
              value={draft.facebook_url}
              onChange={(v) => update('facebook_url', v)}
            />
            <SnsChannelRow
              label="유튜브"
              icon={Youtube}
              iconBg="bg-red-50 text-red-600"
              value={draft.youtube_url}
              onChange={(v) => update('youtube_url', v)}
            />
            <SnsChannelRow
              label="네이버 블로그"
              icon={PenSquare}
              iconBg="bg-emerald-50 text-emerald-600"
              value={draft.blog_url}
              onChange={(v) => update('blog_url', v)}
            />
            <SnsChannelRow
              label="네이버 플레이스"
              icon={Newspaper}
              iconBg="bg-green-50 text-green-700"
              value={draft.naver_url}
              onChange={(v) => update('naver_url', v)}
            />
            <SnsChannelRow
              label="카카오톡 채널"
              icon={MessageCircle}
              iconBg="bg-yellow-50 text-yellow-600"
              value={draft.kakao_url}
              onChange={(v) => update('kakao_url', v)}
            />
          </div>
        )}

        {/* 노출 위치 (백엔드 미지원 placeholder) */}
        <div className="mt-5 rounded-md border border-dashed border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-600">노출 위치</p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" disabled checked /> 푸터
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" disabled /> 우측 하단 플로팅
            </label>
            <span className="ml-2 italic">개별 위치 선택은 곧 제공됩니다.</span>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end border-t border-slate-200 pt-4">
          <Button
            type="button"
            onClick={handleSave}
            disabled={updateMutation.isPending || snsQuery.isLoading}
          >
            {updateMutation.isPending ? '저장 중...' : 'SNS 설정 저장'}
          </Button>
        </div>
      </div>

      {/* 알림 채널 */}
      {notifQuery.isLoading ? (
        <div className="h-72 animate-pulse rounded-lg border border-slate-200 bg-white" />
      ) : notifQuery.data ? (
        <NotificationSettingsCard settings={notifQuery.data} />
      ) : (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          알림 설정을 불러오지 못했습니다.
        </div>
      )}
    </div>
  )
}
