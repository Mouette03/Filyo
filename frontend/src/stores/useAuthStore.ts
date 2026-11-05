import { create } from 'zustand'

interface AuthUser {
  id: string
  email: string
  name: string
  role: 'ADMIN' | 'USER'
  avatarUrl?: string | null
  cleanupAfterDays?: number | null
  twoFactorEnabled?: boolean
  /** 2FA obligatoire mais pas encore configurée : accès limité à /setup-2fa */
  twoFactorSetupRequired?: boolean
}

interface AuthStore {
  user: AuthUser | null
  isAuthenticated: boolean
  setAuth: (user: AuthUser) => void
  logout: () => void
  isAdmin: () => boolean
  updateAvatar: (avatarUrl: string | null) => void
  updateName: (name: string) => void
  updateCleanupPref: (cleanupAfterDays: number | null) => void
  setTwoFactorState: (state: { twoFactorEnabled: boolean; twoFactorSetupRequired?: boolean }) => void
}

export const useAuthStore = create<AuthStore>()((set, get) => ({
  user: null,
  isAuthenticated: false,
  setAuth: (user) => set({ user, isAuthenticated: true }),
  logout: () => set({ user: null, isAuthenticated: false }),
  isAdmin: () => get().user?.role === 'ADMIN',
  updateAvatar: (avatarUrl) => {
    const u = get().user
    if (u) set({ user: { ...u, avatarUrl } })
  },
  updateName: (name) => {
    const u = get().user
    if (u) set({ user: { ...u, name } })
  },
  updateCleanupPref: (cleanupAfterDays) => {
    const u = get().user
    if (u) set({ user: { ...u, cleanupAfterDays } })
  },
  setTwoFactorState: ({ twoFactorEnabled, twoFactorSetupRequired = false }) => {
    const u = get().user
    if (u) set({ user: { ...u, twoFactorEnabled, twoFactorSetupRequired } })
  }
}))
