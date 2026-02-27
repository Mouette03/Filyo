import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthUser {
  id: string
  email: string
  name: string
  role: 'ADMIN' | 'USER'
  avatarUrl?: string | null
}

interface AuthStore {
  token: string | null
  user: AuthUser | null
  isAuthenticated: boolean
  setAuth: (token: string, user: AuthUser) => void
  logout: () => void
  isAdmin: () => boolean
  updateAvatar: (avatarUrl: string | null) => void
  updateName: (name: string) => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      setAuth: (token, user) => set({ token, user, isAuthenticated: true }),
      logout: () => set({ token: null, user: null, isAuthenticated: false }),
      isAdmin: () => get().user?.role === 'ADMIN',
      updateAvatar: (avatarUrl) => {
        const u = get().user
        if (u) set({ user: { ...u, avatarUrl } })
      },
      updateName: (name) => {
        const u = get().user
        if (u) set({ user: { ...u, name } })
      }
    }),
    { name: 'filyo-auth' }
  )
)
