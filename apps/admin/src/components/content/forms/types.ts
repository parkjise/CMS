import type { Section } from '@/hooks/useSections'
import type { SettingUpdate } from '@/hooks/useSection'

export interface SectionFormProps {
  section: Section
  isSaving: boolean
  onSubmit: (settings: SettingUpdate[]) => Promise<void>
}
