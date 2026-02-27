import { create } from 'zustand'

interface AppSettings {
  appName: string
  logoUrl: string | null
}

interface AppSettingsStore {
  settings: AppSettings
  setSettings: (s: Partial<AppSettings>) => void
}

export const useAppSettingsStore = create<AppSettingsStore>()(set => ({
  settings: { appName: 'Filyo', logoUrl: null },
  setSettings: (s) => set(prev => ({ settings: { ...prev.settings, ...s } }))
}))
