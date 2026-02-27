import { useState, useRef } from 'react'
import { User, Camera, Trash2, Lock, RefreshCw, Check, Pencil, Palette, Moon, Sun, Monitor } from 'lucide-react'
import toast from 'react-hot-toast'
import { uploadAvatar, deleteAvatar, changePassword, updateProfile } from '../api/client'
import { useAuthStore } from '../stores/useAuthStore'
import { usePreferencesStore, ACCENT_PRESETS, BG_PRESETS, type ThemeMode, type AccentKey, type BgColorKey } from '../stores/usePreferencesStore'

export default function ProfilePage() {
  const { user, updateAvatar, updateName } = useAuthStore()
  const { theme, accentColor, bgColorKey, setTheme, setAccentColor, setBgColor } = usePreferencesStore()
  const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Moon }[] = [
    { value: 'dark',  label: 'Sombre',    icon: Moon },
    { value: 'light', label: 'Clair',     icon: Sun },
    { value: 'auto',  label: 'Automatique', icon: Monitor },
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

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error('Fichier image requis')
    if (file.size > 3 * 1024 * 1024) return toast.error('Taille max : 3 Mo')
    setUploadingAvatar(true)
    try {
      const form = new FormData()
      form.append('avatar', file)
      const res = await uploadAvatar(form)
      updateAvatar(res.data.avatarUrl)
      toast.success('Avatar mis à jour')
    } catch {
      toast.error('Erreur lors du téléversement')
    }
    setUploadingAvatar(false)
    if (avatarInput.current) avatarInput.current.value = ''
  }

  const handleDeleteAvatar = async () => {
    setDeletingAvatar(true)
    try {
      await deleteAvatar()
      updateAvatar(null)
      toast.success('Avatar supprimé')
    } catch {
      toast.error('Erreur lors de la suppression')
    }
    setDeletingAvatar(false)
  }

  const handleSaveName = async () => {
    if (!newName.trim()) return toast.error('Le nom ne peut pas être vide')
    setSavingName(true)
    try {
      const res = await updateProfile({ name: newName.trim() })
      updateName(res.data.name)
      setEditingName(false)
      toast.success('Nom mis à jour')
    } catch {
      toast.error('Erreur lors de la mise à jour')
    }
    setSavingName(false)
  }

  const handleChangePassword = async () => {
    if (!currentPwd || !newPwd) return toast.error('Remplissez tous les champs')
    if (newPwd.length < 8) return toast.error('Le nouveau mot de passe doit faire au moins 8 caractères')
    if (newPwd !== confirmPwd) return toast.error('Les mots de passe ne correspondent pas')
    setSavingPwd(true)
    try {
      await changePassword(currentPwd, newPwd)
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('')
      toast.success('Mot de passe mis à jour')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erreur lors du changement')
    }
    setSavingPwd(false)
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-brand-500/20 rounded-xl flex items-center justify-center">
          <User size={20} className="text-brand-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Mon profil</h1>
          <p className="text-white/40 text-sm">{user?.email}</p>
        </div>
      </div>

      {/* Section Avatar */}
      <div className="card mb-5">
        <div className="flex items-center gap-2 mb-5">
          <Camera size={16} className="text-brand-400" />
          <h3 className="font-semibold">Photo de profil</h3>
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
              {user?.avatarUrl ? 'Changer la photo' : 'Choisir une photo'}
            </button>
            {user?.avatarUrl && (
              <button
                onClick={handleDeleteAvatar}
                disabled={deletingAvatar}
                className="btn-danger flex items-center gap-2 text-sm py-2.5 px-4 w-full justify-center"
              >
                {deletingAvatar ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Supprimer la photo
              </button>
            )}
            <p className="text-xs text-white/30 text-center">PNG, JPG ou WebP · max 3 Mo</p>
          </div>
        </div>

        <input ref={avatarInput} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
      </div>

      {/* Section Informations */}
      <div className="card mb-5">
        <div className="flex items-center gap-2 mb-4">
          <Pencil size={16} className="text-brand-400" />
          <h3 className="font-semibold">Informations</h3>
        </div>

        <div className="space-y-4">
          {/* Nom */}
          <div>
            <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">Nom affiché</label>
            {editingName ? (
              <div className="flex gap-2">
                <input
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
                  Modifier
                </button>
              </div>
            )}
          </div>

          {/* Email (lecture seule) */}
          <div>
            <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">Adresse email</label>
            <p className="text-white/60 text-sm">{user?.email}</p>
            <p className="text-xs text-white/30 mt-0.5">L'adresse email ne peut être modifiée que par un administrateur.</p>
          </div>

          {/* Rôle */}
          <div>
            <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">Rôle</label>
            <span className={`badge ${user?.role === 'ADMIN' ? 'badge-blue' : 'badge-green'}`}>
              {user?.role === 'ADMIN' ? 'Administrateur' : 'Utilisateur'}
            </span>
          </div>
        </div>
      </div>

      {/* Section Mot de passe */}
      <div className="card">
        <div className="flex items-center gap-2 mb-5">
          <Lock size={16} className="text-brand-400" />
          <h3 className="font-semibold">Changer le mot de passe</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">Mot de passe actuel</label>
            <input
              type="password"
              value={currentPwd}
              onChange={e => setCurrentPwd(e.target.value)}
              placeholder="Votre mot de passe actuel"
              className="input"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">Nouveau mot de passe</label>
            <input
              type="password"
              value={newPwd}
              onChange={e => setNewPwd(e.target.value)}
              placeholder="Min. 8 caractères"
              className="input"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">Confirmer le nouveau mot de passe</label>
            <input
              type="password"
              value={confirmPwd}
              onChange={e => setConfirmPwd(e.target.value)}
              placeholder="Répétez le nouveau mot de passe"
              className="input"
            />
          </div>
          <button
            onClick={handleChangePassword}
            disabled={savingPwd}
            className="btn-primary flex items-center gap-2 py-2.5 px-6"
          >
            {savingPwd ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
            Mettre à jour le mot de passe
          </button>
        </div>
      </div>

      {/* Section Apparence */}
      <div className="card mt-5">
        <div className="flex items-center gap-2 mb-5">
          <Palette size={16} className="text-brand-400" />
          <h3 className="font-semibold">Apparence</h3>
        </div>

        {/* Thème */}
        <div className="mb-6">
          <label className="text-xs text-white/50 mb-3 block uppercase tracking-wider">Thème</label>
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
            {theme === 'auto' ? 'Suit automatiquement le réglage de votre système d’exploitation.' : ''}
          </p>
        </div>

        {/* Couleur d’accent */}
        <div>
          <label className="text-xs text-white/50 mb-3 block uppercase tracking-wider">Couleur principale</label>
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
                  style={{
                    background: preset.hex,
                    ...(active ? { ringColor: preset.hex } : {})
                  }}
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
            Couleur actuelle : <span className="font-medium" style={{ color: ACCENT_PRESETS[accentColor].hex }}>{ACCENT_PRESETS[accentColor].name}</span>
          </p>
        </div>
        {/* Couleur de fond */}
        <div className="mt-6">
          <label className="text-xs text-white/50 mb-3 block uppercase tracking-wider">Couleur d'arrière-plan</label>
          <div className="flex flex-wrap gap-3 mb-3">
            {/* Swatch "Défaut" */}
            <button
              onClick={() => setBgColor(null)}
              title="Défaut"
              className={`w-9 h-9 rounded-xl border-2 transition-all flex items-center justify-center ${
                !bgColorKey
                  ? 'border-brand-500 ring-2 ring-offset-2 ring-offset-surface-800 ring-brand-500'
                  : 'border-white/10 hover:border-white/30'
              } bg-surface-700`}
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
          <p className="text-xs text-white/30">Teinte de fond de l'interface. Se réinitialise au changement de thème.</p>
        </div>      </div>
    </div>
  )
}
