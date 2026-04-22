import axios from 'axios'
import toast from 'react-hot-toast'
import { fr, en } from '../i18n'
import { useI18nStore } from '../stores/useI18nStore'
import { useAuthStore } from '../stores/useAuthStore'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true
})

// Déconnecter si le token est expiré
api.interceptors.response.use(
  r => r,
  err => {
    const code = err.response?.data?.code
    // Déconnecter si le token est invalide/expiré ou si l'utilisateur n'existe plus — pas sur un mauvais mot de passe applicatif
    const SESSION_ENDING_CODES = ['INVALID_TOKEN', 'NOT_FOUND', 'ACCOUNT_DISABLED']
    if (err.response?.status === 401 && SESSION_ENDING_CODES.includes(code) && useAuthStore.getState().isAuthenticated) {
      if (code === 'ACCOUNT_DISABLED') {
        const lang = useI18nStore.getState().lang
        const dict = lang === 'en' ? en : fr
        toast.error(dict['toast.accountDisabled'])
      }
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// ---- Auth ----
export const logoutApi = () => api.post('/auth/logout')
export const checkSetup = () => api.get('/auth/setup')
export const getMe = () => api.get('/auth/me')

export const login = (email: string, password: string) =>
  api.post('/auth/login', { email, password })

export const registerUser = (data: { email: string; name: string; password: string; role?: string }) =>
  api.post('/auth/register', data)

export const changePassword = (currentPassword: string, newPassword: string) =>
  api.post('/auth/change-password', { currentPassword, newPassword })
export const uploadAvatar = (form: FormData) =>
  api.post('/auth/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } })
export const deleteAvatar = () => api.delete('/auth/avatar')
export const updateProfile = (data: { name: string }) => api.patch('/auth/profile', data)
export const getMyQuota = () => api.get<{ storageQuotaBytes: string | null; storageUsedBytes: string }>('/auth/quota')

// ---- Utilisateurs (admin) ----
export const listUsers = () => api.get('/users')
export const createUser = (data: { email: string; name: string; password: string; role: string; storageQuotaMB?: number | null }) =>
  api.post('/users', data)
export const updateUser = (id: string, data: Partial<{ name: string; email: string; role: string; active: boolean; password: string; storageQuotaMB: number | null }>) =>
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
export const listFiles = () => api.get('/files')
export const deleteFile = (id: string) => api.delete(`/files/${id}`)

// ---- Partages (téléchargement) ----
export const getShareInfo = (token: string) => api.get(`/shares/${token}/info`)

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

export const updateProxyUpload = (enabled: boolean) =>
  api.patch('/settings/cf-bypass', { enabled })

export const getTusFileResult = (uploadId: string) =>
  api.get(`/files/tus-result/${uploadId}`)

// ---- Tokens de téléchargement (streaming natif navigateur) ----
export const getShareDlToken = (token: string, password?: string) =>
  api.post<{ dlToken: string }>(`/shares/${token}/dl-token`, { password })

export const getReceivedFileDlToken = (requestId: string, fileId: string) =>
  api.post<{ dlToken: string }>(`/upload-requests/${requestId}/received/${fileId}/dl-token`)

// ---- Envoi email ----
export const sendShareByEmail = (to: string, tokens: string[], lang: string = 'fr') =>
  api.post('/shares/send-email', { to, tokens, lang })

export const sendRequestByEmail = (id: string, to: string, lang: string = 'fr') =>
  api.post(`/upload-requests/${id}/send-email`, { to, lang })

// ---- Expiration fichier ----
export const updateFileExpiry = (id: string, expiresAt: string | null) =>
  api.patch(`/files/${id}/expiry`, { expiresAt })

export const updateFileMaxDownloads = (id: string, maxDownloads: number | null) =>
  api.patch(`/files/${id}/max-downloads`, { maxDownloads })

export const updateRequestExpiry = (id: string, expiresAt: string | null) =>
  api.patch(`/upload-requests/${id}/expiry`, { expiresAt })

// ---- Champs formulaire déposant ----
export const updateUploaderFields = (data: {
  uploaderNameReq?: string
  uploaderEmailReq?: string
  uploaderMsgReq?: string
}) => api.patch('/settings/uploader-fields', data)

export const updateAllowRegistration = (allowRegistration: boolean) =>
  api.patch('/settings/registration', { allowRegistration })

export const updateCleanupSetting = (cleanupAfterDays: number | null) =>
  api.patch('/settings/cleanup', { cleanupAfterDays })

export const updateCleanupPreference = (cleanupAfterDays: number | null) =>
  api.patch('/auth/cleanup-preference', { cleanupAfterDays })

export const forgotPassword = (email: string, lang: string = 'fr') =>
  api.post('/auth/forgot-password', { email, lang })

export const resetPassword = (token: string, password: string) =>
  api.post('/auth/reset-password', { token, password })

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
export const testSmtp = (data: { smtpHost: string; smtpPort: number; smtpFrom: string; smtpUser?: string; smtpPass?: string }) =>
  api.post('/settings/smtp/test', data)
export const updateMaxFileSize = (maxFileSizeBytes: number | null) =>
  api.patch('/settings/max-file-size', { maxFileSizeBytes })

export default api

