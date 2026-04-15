import { useState, useRef, useEffect } from 'react'
import { User, Camera, Trash2, Lock, RefreshCw, Check, Pencil, Eraser, Palette, Moon, Sun, Monitor } from 'lucide-react'
import { usePreferencesStore, ACCENT_PRESETS, BG_PRESETS, type ThemeMode, type AccentKey, type BgColorKey } from '../stores/usePreferencesStore'
import toast from 'react-hot-toast'
import { uploadAvatar, deleteAvatar, changePassword, updateProfile, updateCleanupPreference, getSettings } from '../api/client'
import { useAuthStore } from '../stores/useAuthStore'
import { useT } from '../i18n'

/**
 * Render the user profile UI with controls to view and update avatar, display name, password, and automatic cleanup preference.
 *
 * The component manages local UI state for edit modes and loading indicators, calls authentication/profile APIs for updates,
 * and displays localized success/error toasts based on operation outcomes.
 *
 * @returns A React element representing the profile page.
 */
export default function ProfilePage() {
  const { user, updateAvatar, updateName, updateCleanupPref } = useAuthStore()
  const { t } = useT()
  const { theme, accentColor, bgColorKey, setTheme, setAccentColor, setBgColor } = usePreferencesStore()
  const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Moon }[] = [
    { value: 'dark',  label: t('settings.themeDark'),  icon: Moon },
    { value: 'light', label: t('settings.themeLight'), icon: Sun },
    { value: 'auto',  label: t('settings.themeAuto'),  icon: Monitor },
  ]

  // --- Avatar ---
  const avatarInput = useRef<HTMLInputElement>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [deletingAvatar, setDeletingAvatar] = useState(false)

  // --- Nom ---
  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState(user?.name || '')
  const [savingName, setSavingName] = useState(false)

  // --- Mot de passe ---
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [savingPwd, setSavingPwd] = useState(false)

  // --- Nettoyage automatique ---
  const [cleanupAfterDays, setCleanupAfterDays] = useState<number | null>(user?.cleanupAfterDays ?? null)
  const [savingCleanup, setSavingCleanup] = useState(false)
  const [adminMax, setAdminMax] = useState<number | null>(null)

  useEffect(() => {
    getSettings().then((res: any) => setAdminMax(res.data.cleanupAfterDays ?? null)).catch(() => {})
  }, [])

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error(t('toast.imageRequired'))
    if (file.size > 3 * 1024 * 1024) return toast.error(t('toast.imageTooLarge3'))
    setUploadingAvatar(true)
    try {
      const form = new FormData()
      form.append('avatar', file)
      const res = await uploadAvatar(form)
      updateAvatar(res.data.avatarUrl)
      toast.success(t('toast.avatarUpdated'))
    } catch (err: any) {
      const status = err?.response?.status
      const code = err?.response?.data?.code
      if (status === 413 || code === 'FILE_TOO_LARGE') {
        toast.error(t('toast.imageTooLarge3'))
      } else {
        toast.error(t('toast.uploadError'))
      }
    }
    setUploadingAvatar(false)
    if (avatarInput.current) avatarInput.current.value = ''
  }

  const handleDeleteAvatar = async () => {
    setDeletingAvatar(true)
    try {
      await deleteAvatar()
      updateAvatar(null)
      toast.success(t('toast.avatarDeleted'))
    } catch {
      toast.error(t('toast.deleteError'))
    }
    setDeletingAvatar(false)
  }

  const handleSaveName = async () => {
    if (!newName.trim()) return toast.error(t('toast.nameEmpty'))
    setSavingName(true)
    try {
      const res = await updateProfile({ name: newName.trim() })
      updateName(res.data.name)
      setEditingName(false)
      toast.success(t('toast.nameUpdated'))
    } catch {
      toast.error(t('toast.updateError'))
    }
    setSavingName(false)
  }

  const handleChangePassword = async () => {
    if (!currentPwd || !newPwd) return toast.error(t('toast.allPwdFieldsRequired'))
    if (newPwd.length < 8) return toast.error(t('toast.passwordMin8'))
    if (newPwd !== confirmPwd) return toast.error(t('toast.passwordMismatch'))
    setSavingPwd(true)
    try {
      await changePassword(currentPwd, newPwd)
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('')
      toast.success(t('toast.passwordUpdated'))
    } catch (err: any) {
      const code = err.response?.data?.code
      if (code === 'WRONG_PASSWORD') toast.error(t('error.wrongPassword'))
      else toast.error(t('toast.updateError'))
    }
    setSavingPwd(false)
  }

  const handleSaveCleanup = async (value: number | null) => {
    setSavingCleanup(true)
    try {
      await updateCleanupPreference(value)
      setCleanupAfterDays(value)
      updateCleanupPref(value)
      toast.success(t('profile.cleanupSaved'))
    } catch (err: any) {
      const code = err.response?.data?.code
      if (code === 'CLEANUP_DISABLED') toast.error(t('profile.cleanupDisabled'))
      else if (code === 'CLEANUP_EXCEEDS_MAX') toast.error(t('error.cleanupExceedsMax', { max: String(err.response?.data?.max ?? '') }))
      else toast.error(t('toast.saveError'))
    }
    setSavingCleanup(false)
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-brand-500/20 rounded-xl flex items-center justify-center">
          <User size={20} className="text-brand-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t('profile.title')}</h1>
          <p className="text-white/40 text-sm">{user?.email}</p>
        </div>
      </div>

      {/* Section Informations */}
      <div className="card mb-5">
        <div className="flex items-center gap-2 mb-4">
          <Pencil size={16} className="text-brand-400" />
          <h3 className="font-semibold">{t('profile.infoSection')}</h3>
        </div>

        <div className="space-y-4">
          {/* Nom */}
          <div>
            <label htmlFor="profile-name" className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('profile.displayName')}</label>
            {editingName ? (
              <div className="flex gap-2">
                <input
                  id="profile-name"
                  name="name"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="input flex-1"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
                />
                <button onClick={handleSaveName} disabled={savingName} className="btn-primary flex items-center gap-1.5 px-4">
                  {savingName ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                </button>
                <button onClick={() => { setEditingName(false); setNewName(user?.name || '') }} className="btn-secondary px-4">✕</button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-white/80 font-medium">{user?.name}</span>
                <button onClick={() => { setEditingName(true); setNewName(user?.name || '') }}
                  className="text-xs text-brand-400 hover:text-brand-300">
                  {t('common.edit')}
                </button>
              </div>
            )}
          </div>

          {/* Email (lecture seule) */}
          <div>
            <p className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('profile.emailLabel')}</p>
            <p className="text-white/60 text-sm">{user?.email}</p>
            <p className="text-xs text-white/30 mt-0.5">{t('profile.emailReadonly')}</p>
          </div>

          {/* Rôle */}
          <div>
            <p className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('profile.roleLabel')}</p>
            <span className={`badge ${user?.role === 'ADMIN' ? 'badge-blue' : 'badge-green'}`}>
              {user?.role === 'ADMIN' ? t('role.admin') : t('role.user')}
            </span>
          </div>
        </div>
      </div>

      {/* Section Avatar */}
      <div className="card mb-5">
        <div className="flex items-center gap-2 mb-5">
          <Camera size={16} className="text-brand-400" />
          <h3 className="font-semibold">{t('profile.avatarSection')}</h3>
        </div>

        <div className="flex items-center gap-6">
          {/* Avatar preview */}
          <div className="relative flex-shrink-0">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt="Avatar"
                className="w-20 h-20 rounded-2xl object-cover border border-white/10"
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-brand-500/20 flex items-center justify-center text-brand-400 text-3xl font-bold border border-white/10">
                {user?.name?.charAt(0).toUpperCase()}
              </div>
            )}
            {uploadingAvatar && (
              <div className="absolute inset-0 rounded-2xl bg-black/60 flex items-center justify-center">
                <RefreshCw size={20} className="text-white animate-spin" />
              </div>
            )}
          </div>

          {/* Boutons */}
          <div className="space-y-2 flex-1">
            <button
              onClick={() => avatarInput.current?.click()}
              disabled={uploadingAvatar}
              className="btn-secondary flex items-center gap-2 text-sm py-2.5 px-4 w-full justify-center"
            >
              <Camera size={14} />
              {user?.avatarUrl ? t('profile.changePhoto') : t('profile.choosePhoto')}
            </button>
            {user?.avatarUrl && (
              <button
                onClick={handleDeleteAvatar}
                disabled={deletingAvatar}
                className="btn-danger flex items-center gap-2 text-sm py-2.5 px-4 w-full justify-center"
              >
                {deletingAvatar ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {t('profile.removePhoto')}
              </button>
            )}
            <p className="text-xs text-white/30 text-center">{t('profile.avatarHint')}</p>
          </div>
        </div>

        <input ref={avatarInput} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
      </div>

      {/* Section Apparence */}
      <div className="card mb-5">
        <div className="flex items-center gap-2 mb-5">
          <Palette size={16} className="text-brand-400" />
          <h3 className="font-semibold">{t('settings.appearanceSection')}</h3>
        </div>

        {/* Thème */}
        <div className="mb-6">
          <p className="text-xs text-white/50 mb-3 block uppercase tracking-wider">{t('settings.themeLabel')}</p>
          <div className="grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map(opt => {
              const Icon = opt.icon
              const active = theme === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={`flex flex-col items-center gap-2 py-3 px-2 rounded-xl border transition-all ${
                    active
                      ? 'border-brand-500 bg-brand-500/15 text-brand-400'
                      : 'border-white/10 bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/10'
                  }`}
                >
                  <Icon size={20} />
                  <span className="text-xs font-medium">{opt.label}</span>
                </button>
              )
            })}
          </div>
          <p className="text-xs text-white/30 mt-2">
            {theme === 'auto' ? t('settings.themeAutoHint') : ''}
          </p>
        </div>

        {/* Couleur d'accent */}
        <div>
          <p className="text-xs text-white/50 mb-3 block uppercase tracking-wider">{t('settings.accentLabel')}</p>
          <div className="flex flex-wrap gap-3">
            {(Object.entries(ACCENT_PRESETS) as [AccentKey, typeof ACCENT_PRESETS[AccentKey]][]).map(([key, preset]) => {
              const active = accentColor === key
              return (
                <button
                  key={key}
                  onClick={() => setAccentColor(key)}
                  title={preset.name}
                  className={`w-9 h-9 rounded-xl transition-all ${
                    active ? 'scale-110 ring-2 ring-offset-2 ring-offset-surface-800' : 'hover:scale-105 opacity-80 hover:opacity-100'
                  }`}
                  style={{ background: preset.hex }}
                >
                  {active && (
                    <span className="flex items-center justify-center w-full h-full">
                      <Check size={14} className="text-white drop-shadow" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-white/30 mt-3">
            {t('settings.accentCurrent', { name: ACCENT_PRESETS[accentColor].name })}
          </p>
        </div>

        {/* Couleur de fond */}
        <div className="mt-6">
          <p className="text-xs text-white/50 mb-3 block uppercase tracking-wider">{t('settings.bgLabel')}</p>
          <div className="flex flex-wrap gap-3 mb-3">
            <button
              onClick={() => setBgColor(null)}
              title={t('settings.bgDefault')}
              className={`w-9 h-9 rounded-xl border-2 transition-all flex items-center justify-center bg-surface-700 ${
                !bgColorKey
                  ? 'border-brand-500 ring-2 ring-offset-2 ring-offset-surface-800 ring-brand-500'
                  : 'border-white/10 hover:border-white/30'
              }`}
            >
              {!bgColorKey && <Check size={14} className="text-white" />}
            </button>
            {(Object.entries(BG_PRESETS) as [BgColorKey, typeof BG_PRESETS[BgColorKey]][]).filter(([, p]) => p.theme === (isDark ? 'dark' : 'light')).map(([key, preset]) => {
              const active = bgColorKey === key
              return (
                <button
                  key={key}
                  onClick={() => setBgColor(key)}
                  title={preset.label}
                  className={`w-9 h-9 rounded-xl transition-all ${
                    active ? 'scale-110 ring-2 ring-offset-2 ring-offset-surface-800' : 'hover:scale-105 opacity-80 hover:opacity-100'
                  }`}
                  style={{ background: preset.s900, border: '2px solid', borderColor: active ? 'white' : 'transparent' }}
                >
                  {active && (
                    <span className="flex items-center justify-center w-full h-full">
                      <Check size={14} className="text-white drop-shadow" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-white/30">{t('settings.bgHint')}</p>
        </div>
      </div>

      {/* Section Nettoyage automatique */}
      <div className="card mb-5">
        <div className="flex items-center gap-2 mb-4">
          <Eraser size={16} className="text-brand-400" />
          <h3 className="font-semibold">{t('profile.cleanupSection')}</h3>
        </div>
        {adminMax == null ? (
          <p className="text-sm text-white/40 italic">{t('profile.cleanupDisabled')}</p>
        ) : (
          <div className="space-y-3">
            {/* Info : délai par défaut du serveur */}
            <div className="flex items-center gap-2 rounded-lg bg-brand-500/10 border border-brand-500/20 px-3 py-2">
              <Eraser size={13} className="text-brand-400 flex-shrink-0" />
              <p className="text-xs text-brand-300">
                {t('profile.cleanupServerDefault', { days: String(adminMax) })}
              </p>
            </div>
            <p className="text-xs text-white/50">{t('profile.cleanupHint')}</p>
            <div className="flex items-center gap-3">
              <select
                value={cleanupAfterDays == null ? '' : String(cleanupAfterDays)}
                onChange={e => {
                  const v = e.target.value
                  handleSaveCleanup(v === '' ? null : Number(v))
                }}
                disabled={savingCleanup}
                className="input bg-surface-700 flex-1"
              >
                <option value="">{t('profile.cleanupDefault', { days: String(adminMax) })}</option>
                {adminMax >= 0 && <option value="0">{t('settings.cleanupAtExpiry')}</option>}
                {adminMax >= 1 && <option value="1">{t('settings.cleanup1d')}</option>}
                {adminMax >= 3 && <option value="3">{t('settings.cleanup3d')}</option>}
                {adminMax >= 7 && <option value="7">{t('settings.cleanup7d')}</option>}
                {adminMax >= 30 && <option value="30">{t('settings.cleanup30d')}</option>}
              </select>
              {savingCleanup && <RefreshCw size={16} className="text-brand-400 animate-spin flex-shrink-0" />}
            </div>
          </div>
        )}
      </div>

      {/* Section Mot de passe */}
      <div className="card">
        <div className="flex items-center gap-2 mb-5">
          <Lock size={16} className="text-brand-400" />
          <h3 className="font-semibold">{t('profile.passwordSection')}</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="profile-current-pwd" className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('profile.currentPassword')}</label>
            <input
              id="profile-current-pwd"
              name="current-password"
              type="password"
              value={currentPwd}
              onChange={e => setCurrentPwd(e.target.value)}
              placeholder={t('profile.currentPassword')}
              className="input"
            />
          </div>
          <div>
            <label htmlFor="profile-new-pwd" className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('profile.newPassword')}</label>
            <input
              id="profile-new-pwd"
              name="new-password"
              type="password"
              value={newPwd}
              onChange={e => setNewPwd(e.target.value)}
              placeholder={t('login.passwordPlaceholder')}
              className="input"
            />
          </div>
          <div>
            <label htmlFor="profile-confirm-pwd" className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('profile.confirmNewPassword')}</label>
            <input
              id="profile-confirm-pwd"
              name="confirm-new-password"
              type="password"
              value={confirmPwd}
              onChange={e => setConfirmPwd(e.target.value)}
              placeholder={t('login.confirmPasswordPlaceholder')}
              className="input"
            />
          </div>
          <button
            onClick={handleChangePassword}
            disabled={savingPwd}
            className="btn-primary flex items-center gap-2 py-2.5 px-6"
          >
            {savingPwd ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
            {t('profile.updatePassword')}
          </button>
        </div>
      </div>
    </div>
  )
}

