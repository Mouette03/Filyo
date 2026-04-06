import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/useAuthStore'
import { checkSetup } from '../api/client'

interface Props {
  children: React.ReactNode
  adminOnly?: boolean
}

export default function ProtectedRoute({ children, adminOnly = false }: Props) {
  const { isAuthenticated, isAdmin } = useAuthStore()
  const [setupNeeded, setSetupNeeded] = useState<boolean | null>(null)

  useEffect(() => {
    checkSetup()
      .then(r => setSetupNeeded(r.data.setupNeeded))
      .catch(() => setSetupNeeded(false))
  }, [])

  // En attente de la réponse du serveur
  if (setupNeeded === null) return null

  // Si setup nécessaire, forcer la page de login (mode création compte admin)
  if (setupNeeded) return <Navigate to="/login" replace />

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (adminOnly && !isAdmin()) return <Navigate to="/" replace />

  return <>{children}</>
}
