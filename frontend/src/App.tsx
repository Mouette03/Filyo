import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useEffect } from 'react'
import { usePreferencesStore, applyTheme, applyAccent, applyBgColor, resetBgColor } from './stores/usePreferencesStore'
import { useAppSettingsStore } from './stores/useAppSettingsStore'
import HomePage from './pages/HomePage'
import SharePage from './pages/SharePage'
import RequestUploadPage from './pages/RequestUploadPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import CreateRequestPage from './pages/CreateRequestPage'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import UsersPage from './pages/UsersPage'
import SettingsPage from './pages/SettingsPage'
import ProfilePage from './pages/ProfilePage'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'

export default function App() {
  const { theme, accentColor, bgColorKey } = usePreferencesStore()
  const { settings } = useAppSettingsStore()

  // Favicon dynamique : utilise le logo personnalisé si défini, sinon /favicon.svg
  useEffect(() => {
    const href = settings.logoUrl ?? '/favicon.svg'
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (icon) icon.href = href
    const apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
    if (apple) apple.href = href
  }, [settings.logoUrl])

  // Titre de l'onglet dynamique
  useEffect(() => {
    document.title = settings.appName || 'Filyo'
  }, [settings.appName])

  useEffect(() => {
    applyAccent(accentColor)
    applyTheme(theme)
    if (bgColorKey) applyBgColor(bgColorKey)
    if (theme === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => { applyTheme('auto'); resetBgColor() }
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [theme, accentColor, bgColorKey])

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--surface-800)',
            color: 'var(--text-base)',
            border: '1px solid var(--glass-border)',
            borderRadius: '12px',
          },
          success: { iconTheme: { primary: '#5c6bfa', secondary: '#fff' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } }
        }}
      />
      <Routes>
        {/* Page de connexion */}
        <Route path="/login" element={<LoginPage />} />

        {/* Pages publiques sans layout */}
        <Route path="/s/:token" element={<SharePage />} />
        <Route path="/r/:token" element={<RequestUploadPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Pages protégées avec layout */}
        <Route element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/request/new" element={<CreateRequestPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={
            <ProtectedRoute adminOnly>
              <SettingsPage />
            </ProtectedRoute>
          } />
          <Route path="/users" element={
            <ProtectedRoute adminOnly>
              <UsersPage />
            </ProtectedRoute>
          } />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
