import { useState } from 'react'
import { MapPin } from 'lucide-react'
import { Input } from '@cms/ui'
import { FormField } from './FormField'
import { SaveBar } from './HeroBannerForm'
import { getSetting, strSetting } from './utils'
import type { SectionFormProps } from './types'

const ADDRESS_MAX = 120
const DESC_MAX = 80

export function MapForm({ section, isSaving, onSubmit }: SectionFormProps) {
  const [address, setAddress] = useState(getSetting(section.settings, 'address'))
  const [addressDetail, setAddressDetail] = useState(
    getSetting(section.settings, 'address_detail')
  )
  const [latitude, setLatitude] = useState(getSetting(section.settings, 'latitude'))
  const [longitude, setLongitude] = useState(getSetting(section.settings, 'longitude'))

  const overLimit = address.length > ADDRESS_MAX || addressDetail.length > DESC_MAX

  const handleSave = async () => {
    await onSubmit([
      strSetting('address', address),
      strSetting('address_detail', addressDetail),
      strSetting('latitude', latitude),
      strSetting('longitude', longitude),
    ])
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (!overLimit) handleSave()
      }}
    >
      <div className="rounded-md border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700">
        <MapPin className="mb-1 inline h-3.5 w-3.5" /> 카카오 지도 API 자동 연동은 곧
        제공됩니다. 지금은 주소·좌표를 직접 입력해주세요.
      </div>

      <FormField label="주소">
        <Input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="서울시 강남구 테헤란로 123"
        />
      </FormField>

      <FormField label="상세 주소 / 안내">
        <Input
          value={addressDetail}
          onChange={(e) => setAddressDetail(e.target.value)}
          placeholder="3층 / 강남역 2번 출구 도보 3분"
        />
      </FormField>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField label="위도 (선택)">
          <Input
            type="number"
            step="any"
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
            placeholder="37.4979"
          />
        </FormField>
        <FormField label="경도 (선택)">
          <Input
            type="number"
            step="any"
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
            placeholder="127.0276"
          />
        </FormField>
      </div>

      <SaveBar isSaving={isSaving} disabled={overLimit} />
    </form>
  )
}
