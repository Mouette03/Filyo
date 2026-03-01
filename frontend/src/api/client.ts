import axios from 'axios'
import { useAuthStore } from '../stores/useAuthStore'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' }
})

// Injecter le token JWT sur chaque requête
api.interceptors.request.use(config => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Déconnecter si le token est expiré
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401 && useAuthStore.getState().isAuthenticated) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// ---- Auth ----
export const checkSetup = () => api.get('/auth/setup')

export const login = (email: string, password: string) =>
  api.post('/auth/login', { email, password })

export const getMe = () => api.get('/auth/me')

export const registerUser = (data: { email: string; name: string; password: string; role?: string }) =>
  api.post('/auth/register', data)

export const changePassword = (currentPassword: string, newPassword: string) =>
  api.post('/auth/change-password', { currentPassword, newPassword })
export const uploadAvatar = (form: FormData) =>
  api.post('/auth/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } })
export const deleteAvatar = () => api.delete('/auth/avatar')
export const updateProfile = (data: { name: string }) => api.patch('/auth/profile', data)

// ---- Utilisateurs (admin) ----
export const listUsers = () => api.get('/users')
export const createUser = (data: { email: string; name: string; password: string; role: string }) =>
  api.post('/users', data)
export const updateUser = (id: string, data: Partial<{ name: string; email: string; role: string; active: boolean; password: string }>) =>
  api.patch(`/users/${id}`, data)
export const deleteUser = (id: string) => api.delete(`/users/${id}`)

// ---- Réglages ----
export const getSettings = () => api.get('/settings')
export const updateAppName = (appName: string) => api.patch('/settings/name', { appName })
export const updateSiteUrl = (siteUrl: string) => api.patch('/settings/site-url', { siteUrl })
export const uploadLogo = (formData: FormData) =>
  api.post('/settings/logo', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const deleteLogo = () => api.delete('/settings/logo')

// ---- Fichiers ----
export const uploadFiles = (
  formData: FormData,
  onProgress?: (pct: number) => void
) =>
  api.post('/files', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: e => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total))
    }
  })

export const listFiles = () => api.get('/files')
export const deleteFile = (id: string) => api.delete(`/files/${id}`)

// ---- Partages (téléchargement) ----
export const getShareInfo = (token: string) => api.get(`/shares/${token}/info`)
export const downloadShare = (token: string, password?: string) =>
  api.post(
    `/shares/${token}/download`,
    { password },
    { responseType: 'blob' }
  )

// ---- Partage inversé (Upload Request) ----
export const createUploadRequest = (data: {
  title: string
  message?: string
  password?: string
  expiresIn?: string
  maxFiles?: string
  maxSizeMb?: string
}) => api.post('/upload-requests', data)

export const listUploadRequests = () => api.get('/upload-requests')
export const deleteUploadRequest = (id: string) => api.delete(`/upload-requests/${id}`)
export const toggleUploadRequest = (id: string) => api.patch(`/upload-requests/${id}/toggle`)
export const getUploadRequestInfo = (token: string) =>
  api.get(`/upload-requests/${token}/info`)
export const getReceivedFiles = (id: string) => api.get(`/upload-requests/${id}/files`)

export const submitToUploadRequest = (
  token: string,
  formData: FormData,
  onProgress?: (pct: number) => void
) =>
  api.post(`/upload-requests/${token}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: e => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total))
    }
  })

export const downloadReceivedFile = (requestId: string, fileId: string) =>
  api.get(`/upload-requests/${requestId}/received/${fileId}/download`, {
    responseType: 'blob'
  })

// ---- Envoi email ----
export const sendShareByEmail = (to: string, tokens: string[]) =>
  api.post('/shares/send-email', { to, tokens })

// ---- Admin ----
export const getStats = () => api.get('/admin/stats')
export const runCleanup = () => api.post('/admin/cleanup')
export const getAllFilesAdmin = () => api.get('/admin/files')
export const getAllUploadRequestsAdmin = () => api.get('/admin/upload-requests')
export const getSmtpSettings = () => api.get('/settings/smtp')
export const updateSmtpSettings = (data: {
  smtpHost?: string; smtpPort?: number; smtpFrom?: string
  smtpUser?: string; smtpPass?: string; smtpSecure?: boolean
}) => api.patch('/settings/smtp', data)
export const testSmtp = () => api.post('/settings/smtp/test')

export default api

