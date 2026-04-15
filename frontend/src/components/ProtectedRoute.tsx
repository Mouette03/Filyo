import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/useAuthStore'
import { checkSetup } from '../api/client'
import axios from 'axios'

interface Props {
  children: React.ReactNode
  adminOnly?: boolean
}

export default function ProtectedRoute({ children, adminOnly = false }: Props) {
  const { isAuthenticated, isAdmin, setAuth } = useAuthStore()
  const [setupNeeded, setSetupNeeded] = useState<boolean | null>(null)
  const [authChecked, setAuthChecked] = useState(isAuthenticated)

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      try {
        const setupRes = await checkSetup()
        if (cancelled) return
        setSetupNeeded(setupRes.data.setupNeeded)
      } catch {
        if (!cancelled) setSetupNeeded(false)
        return
      }

      // Si le store ne contient pas de session, tenter de la restaurer via le cookie
      if (!isAuthenticated) {
        try {
          const meRes = await axios.get('/api/auth/me', { withCredentials: true })
          if (!cancelled) setAuth(meRes.data)
        } catch { /* cookie absent ou expiré */ }
      }

      if (!cancelled) setAuthChecked(true)
    }

    init()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // En attente de la réponse du serveur
  if (setupNeeded === null || !authChecked) return null

  // Si setup nécessaire, forcer la page de login (mode création compte admin)
  if (setupNeeded) return <Navigate to="/login" replace />

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (adminOnly && !isAdmin()) return <Navigate to="/" replace />

  return <>{children}</>
}
