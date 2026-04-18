import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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
  maxFileSizeBytes: string | null
  cfBypassEnabled: boolean
  cfBypassChunkMb: number
  tusExpiryMs: number
}

interface AppSettingsStore {
  settings: AppSettings
  setSettings: (s: Partial<AppSettings>) => void
}

export const useAppSettingsStore = create<AppSettingsStore>()(
  persist(
    (set) => ({
      settings: {
        appName: 'Filyo',
        logoUrl: null,
        allowRegistration: false,
        siteUrl: '',
        uploaderNameReq: 'optional',
        uploaderEmailReq: 'optional',
        uploaderMsgReq: 'optional',
        cleanupAfterDays: null,
        maxFileSizeBytes: null,
        cfBypassEnabled: false,
        cfBypassChunkMb: 90,
        tusExpiryMs: 3600000
      },
      setSettings: (s) => set(prev => ({ settings: { ...prev.settings, ...s } }))
    }),
    {
      name: 'filyo-app-settings'
    }
  )
)
