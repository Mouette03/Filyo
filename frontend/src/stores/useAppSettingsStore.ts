import { create } from 'zustand'
import type { FieldReq } from '../types/common'

interface AppSettings {
  appName: string
  logoUrl: string | null
  allowRegistration: boolean
  siteUrl: string
  uploaderNameReq: FieldReq
  uploaderEmailReq: FieldReq
  uploaderMsgReq: FieldReq
  cleanupAfterDays: number | null
}

interface AppSettingsStore {
  settings: AppSettings
  setSettings: (s: Partial<AppSettings>) => void
}

export const useAppSettingsStore = create<AppSettingsStore>()(set => ({
  settings: {
    appName: 'Filyo',
    logoUrl: null,
    allowRegistration: false,
    siteUrl: '',
    uploaderNameReq: 'optional',
    uploaderEmailReq: 'optional',
    uploaderMsgReq: 'optional',
    cleanupAfterDays: null
  },
  setSettings: (s) => set(prev => ({ settings: { ...prev.settings, ...s } }))
}))
