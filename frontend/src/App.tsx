import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useEffect } from 'react'
import { usePreferencesStore, applyTheme, applyAccent, applyBgColor } from './stores/usePreferencesStore'
import HomePage from './pages/HomePage'
import SharePage from './pages/SharePage'
import RequestUploadPage from './pages/RequestUploadPage'
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

  useEffect(() => {
    applyAccent(accentColor)
    applyTheme(theme)
    if (bgColorKey) applyBgColor(bgColorKey)
    if (theme === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => applyTheme('auto')
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
            background: '#1c1f3a',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.1)',
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
