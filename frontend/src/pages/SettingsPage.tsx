import { useEffect, useState, useRef } from 'react'
import { Settings, Upload, Trash2, Check, Type, Image, RefreshCw, Mail, Eye, EyeOff, Wifi, Globe, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { getSettings, updateAppName, uploadLogo, deleteLogo, getSmtpSettings, updateSmtpSettings, testSmtp, updateSiteUrl, updateUploaderFields } from '../api/client'
import { useAppSettingsStore } from '../stores/useAppSettingsStore'

export default function SettingsPage() {
  const { settings, setSettings } = useAppSettingsStore()

  const [appName, setAppName] = useState(settings.appName || 'Filyo')
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl || '')
  const [saving, setSaving] = useState(false)
  const [siteUrl, setSiteUrl] = useState('')
  const [savingUrl, setSavingUrl] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // SMTP
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpFrom, setSmtpFrom] = useState('')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [smtpSecure, setSmtpSecure] = useState(true)
  const [showSmtpPass, setShowSmtpPass] = useState(false)
  const [savingSmtp, setSavingSmtp] = useState(false)
  const [testingSmtp, setTestingSmtp] = useState(false)

  // Champs déposant
  type FieldReq = 'hidden' | 'optional' | 'required'
  const [uploaderNameReq, setUploaderNameReq] = useState<FieldReq>('optional')
  const [uploaderEmailReq, setUploaderEmailReq] = useState<FieldReq>('optional')
  const [uploaderMsgReq, setUploaderMsgReq] = useState<FieldReq>('optional')
  const [savingFields, setSavingFields] = useState(false)

  useEffect(() => {
    getSettings().then(res => {
      setAppName(res.data.appName || 'Filyo')
      setLogoUrl(res.data.logoUrl || '')
      setSiteUrl(res.data.siteUrl || '')
      setUploaderNameReq(res.data.uploaderNameReq || 'optional')
      setUploaderEmailReq(res.data.uploaderEmailReq || 'optional')
      setUploaderMsgReq(res.data.uploaderMsgReq || 'optional')
    }).catch(() => {})
    getSmtpSettings().then(res => {
      setSmtpHost(res.data.smtpHost || '')
      setSmtpPort(String(res.data.smtpPort || 587))
      setSmtpFrom(res.data.smtpFrom || '')
      setSmtpUser(res.data.smtpUser || '')
      setSmtpPass(res.data.smtpPass || '')
      setSmtpSecure(res.data.smtpSecure ?? true)
    }).catch(() => {})
  }, [])

  const handleSaveName = async () => {
    if (!appName.trim()) return toast.error('Le nom ne peut pas être vide')
    setSaving(true)
    try {
      const res = await updateAppName(appName.trim())
      setSettings({ appName: res.data.appName, logoUrl: logoUrl || null })
      toast.success('Nom mis à jour')
    } catch { toast.error('Erreur lors de la sauvegarde') }
    setSaving(false)
  }

  const handleSaveUrl = async () => {
    setSavingUrl(true)
    try {
      await updateSiteUrl(siteUrl.trim())
      toast.success('Adresse du site enregistrée')
    } catch { toast.error('Erreur lors de la sauvegarde') }
    setSavingUrl(false)
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error('Fichier image requis')
    if (file.size > 2 * 1024 * 1024) return toast.error('Taille max : 2 Mo')

    setUploading(true)
    try {
      const form = new FormData()
      form.append('logo', file)
      const res = await uploadLogo(form)
      const newLogoUrl = res.data.logoUrl
      setLogoUrl(newLogoUrl)
      setSettings({ appName, logoUrl: newLogoUrl })
      toast.success('Logo mis à jour')
    } catch { toast.error('Erreur lors du téléversement') }
    setUploading(false)
    if (fileInput.current) fileInput.current.value = ''
  }

  const handleDeleteLogo = async () => {
    setDeleting(true)
    try {
      await deleteLogo()
      setLogoUrl('')
      setSettings({ appName, logoUrl: null })
      toast.success('Logo supprimé')
    } catch { toast.error('Erreur lors de la suppression') }
    setDeleting(false)
  }

  const handleSaveSmtp = async () => {
    setSavingSmtp(true)
    try {
      await updateSmtpSettings({
        smtpHost: smtpHost.trim() || undefined,
        smtpPort: smtpPort ? parseInt(smtpPort) : undefined,
        smtpFrom: smtpFrom.trim() || undefined,
        smtpUser: smtpUser.trim() || undefined,
        smtpPass: smtpPass || undefined,
        smtpSecure
      })
      toast.success('Configuration SMTP enregistrée')
    } catch { toast.error('Erreur lors de la sauvegarde SMTP') }
    setSavingSmtp(false)
  }

  const handleSaveFields = async () => {
    setSavingFields(true)
    try {
      await updateUploaderFields({ uploaderNameReq, uploaderEmailReq, uploaderMsgReq })
      toast.success('Configuration enregistrée')
    } catch { toast.error('Erreur lors de la sauvegarde') }
    setSavingFields(false)
  }

  const handleTestSmtp = async () => {
    setTestingSmtp(true)
    try {
      const res = await testSmtp()
      toast.success(res.data.message || 'Connexion SMTP réussie ✅')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Test SMTP échoué')
    }
    setTestingSmtp(false)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      {/* Titre */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-brand-500/20 rounded-xl flex items-center justify-center">
          <Settings size={20} className="text-brand-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Réglages</h1>
          <p className="text-white/40 text-sm">Personnalisation de l'application</p>
        </div>
      </div>

      {/* Section : Nom de l'application */}
      <div className="card mb-5">
        <div className="flex items-center gap-2 mb-4">
          <Type size={16} className="text-brand-400" />
          <h3 className="font-semibold">Nom de l'application</h3>
        </div>
        <div className="flex gap-3">
          <input
            value={appName}
            onChange={e => setAppName(e.target.value)}
            className="input flex-1"
            placeholder="Nom affiché dans la barre de navigation"
            maxLength={64}
          />
          <button onClick={handleSaveName} disabled={saving}
            className="btn-primary flex items-center gap-2 px-5 whitespace-nowrap">
            {saving
              ? <RefreshCw size={14} className="animate-spin" />
              : <Check size={14} />}
            Enregistrer
          </button>
        </div>
        <p className="text-xs text-white/30 mt-2">
          Affiché dans la barre de navigation et sur la page de connexion.
        </p>
      </div>

      {/* Section : Adresse du site */}
      <div className="card mb-5">
        <div className="flex items-center gap-2 mb-4">
          <Globe size={16} className="text-brand-400" />
          <h3 className="font-semibold">Adresse du site</h3>
        </div>
        <div className="flex gap-3">
          <input
            value={siteUrl}
            onChange={e => setSiteUrl(e.target.value)}
            className="input flex-1"
            placeholder="https://filyo.mondomaine.fr"
          />
          <button onClick={handleSaveUrl} disabled={savingUrl}
            className="btn-primary flex items-center gap-2 px-5 whitespace-nowrap">
            {savingUrl ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
            Enregistrer
          </button>
        </div>
        {siteUrl && (
          <p className="text-xs text-white/30 mt-2">
            Exemple : <span className="text-brand-400 font-mono">{siteUrl}/s/xK9mPqR3</span>
          </p>
        )}
        <p className="text-xs text-white/30 mt-1">
          Utilisée pour générer les liens de partage envoyés par email.
        </p>
      </div>

      {/* Section : Logo */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Image size={16} className="text-brand-400" />
          <h3 className="font-semibold">Logo</h3>
        </div>

        {logoUrl ? (
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
              <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain p-2" />
            </div>
            <div className="space-y-2">
              <button onClick={() => fileInput.current?.click()}
                className="btn-secondary flex items-center gap-2 text-sm py-2.5 px-4 w-full justify-center">
                <Upload size={14} /> Remplacer
              </button>
              <button onClick={handleDeleteLogo} disabled={deleting}
                className="btn-danger flex items-center gap-2 text-sm py-2.5 px-4 w-full justify-center">
                {deleting ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Supprimer
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => fileInput.current?.click()}
            className="border-2 border-dashed border-white/15 rounded-xl p-10 text-center cursor-pointer hover:border-brand-500/50 hover:bg-brand-500/5 transition-all group"
          >
            <div className="w-12 h-12 bg-brand-500/15 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:bg-brand-500/25 transition-colors">
              {uploading
                ? <RefreshCw size={22} className="text-brand-400 animate-spin" />
                : <Upload size={22} className="text-brand-400" />}
            </div>
            <p className="font-medium text-white/70 mb-1">
              {uploading ? 'Téléversement…' : 'Cliquez pour choisir un logo'}
            </p>
            <p className="text-xs text-white/30">PNG, JPG ou SVG · max 2 Mo</p>
          </div>
        )}

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          onChange={handleLogoUpload}
          className="hidden"
        />
        <p className="text-xs text-white/30 mt-3">
          Format recommandé : carré, fond transparent (PNG ou SVG). Taille max : 2 Mo.
        </p>
      </div>

      {/* Section : Serveur SMTP */}
      <div className="card mt-5">
        <div className="flex items-center gap-2 mb-5">
          <Mail size={16} className="text-brand-400" />
          <h3 className="font-semibold">Serveur SMTP</h3>
          <span className="text-xs text-white/30 ml-auto">Utilisé pour l'envoi des liens de partage par email</span>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="col-span-2 sm:col-span-1">
            <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">Hôte SMTP</label>
            <input
              value={smtpHost}
              onChange={e => setSmtpHost(e.target.value)}
              placeholder="smtp.example.com"
              className="input"
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">Port</label>
            <input
              value={smtpPort}
              onChange={e => setSmtpPort(e.target.value)}
              placeholder="587"
              type="number"
              className="input"
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">Adresse expéditeur</label>
            <input
              value={smtpFrom}
              onChange={e => setSmtpFrom(e.target.value)}
              placeholder="noreply@mondomaine.fr"
              type="email"
              className="input"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">Identifiant (login)</label>
            <input
              value={smtpUser}
              onChange={e => setSmtpUser(e.target.value)}
              placeholder="smtp_user"
              autoComplete="off"
              className="input"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">Mot de passe</label>
            <div className="relative">
              <input
                value={smtpPass}
                onChange={e => setSmtpPass(e.target.value)}
                placeholder="••••••••"
                type={showSmtpPass ? 'text' : 'password'}
                autoComplete="new-password"
                className="input pr-10"
              />
              <button
                type="button"
                onClick={() => setShowSmtpPass(!showSmtpPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
              >
                {showSmtpPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        </div>

        {/* Option TLS */}
        <div className="flex items-center justify-between py-3 px-4 bg-white/3 rounded-xl mb-5">
          <div>
            <p className="text-sm font-medium">Connexion sécurisée (TLS)</p>
            <p className="text-xs text-white/40 mt-0.5">Recommandé pour SMTP sur port 465 ou STARTTLS sur 587</p>
          </div>
          <div
            onClick={() => setSmtpSecure(!smtpSecure)}
            className={`w-11 h-6 rounded-full cursor-pointer transition-colors relative flex-shrink-0 ${smtpSecure ? 'bg-brand-500' : 'bg-white/20'}`}
          >
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${smtpSecure ? 'translate-x-6' : 'translate-x-1'}`} />
          </div>
        </div>

        {/* Boutons */}
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={handleSaveSmtp}
            disabled={savingSmtp}
            className="btn-primary flex items-center gap-2 py-2.5 px-5"
          >
            {savingSmtp ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
            Enregistrer
          </button>
          <button
            onClick={handleTestSmtp}
            disabled={testingSmtp || !smtpHost}
            className="btn-secondary flex items-center gap-2 py-2.5 px-5 disabled:opacity-40"
          >
            {testingSmtp ? <RefreshCw size={14} className="animate-spin" /> : <Wifi size={14} />}
            Tester la connexion
          </button>
        </div>
        <p className="text-xs text-white/30 mt-3">
          Le test vérifie uniquement l'accessibilité réseau du serveur SMTP. La fonctionnalité d'envoi d'emails sera disponible dans une prochaine version.
        </p>
      </div>

      {/* Section : Champs formulaire déposant */}
      <div className="card mt-5">
        <div className="flex items-center gap-2 mb-5">
          <Users size={16} className="text-brand-400" />
          <h3 className="font-semibold">Formulaire du déposant</h3>
          <span className="text-xs text-white/30 ml-auto">Contrôle les champs affichés lors d'un partage inversé</span>
        </div>

        {([
          { label: 'Nom', key: 'uploaderNameReq', value: uploaderNameReq, set: setUploaderNameReq },
          { label: 'Adresse email', key: 'uploaderEmailReq', value: uploaderEmailReq, set: setUploaderEmailReq },
          { label: 'Message', key: 'uploaderMsgReq', value: uploaderMsgReq, set: setUploaderMsgReq },
        ] as { label: string; key: string; value: string; set: (v: any) => void }[]).map(field => (
          <div key={field.key} className="flex items-center justify-between py-3 px-4 bg-white/3 rounded-xl mb-3">
            <div>
              <p className="text-sm font-medium">{field.label}</p>
              <p className="text-xs text-white/40 mt-0.5">
                {field.value === 'hidden' && 'Non affiché dans le formulaire'}
                {field.value === 'optional' && 'Affiché, remplissage facultatif'}
                {field.value === 'required' && 'Affiché, remplissage obligatoire'}
              </p>
            </div>
            <select
              value={field.value}
              onChange={e => field.set(e.target.value)}
              className="input text-sm py-1.5 w-40"
            >
              <option value="hidden">Masqué</option>
              <option value="optional">Facultatif</option>
              <option value="required">Obligatoire</option>
            </select>
          </div>
        ))}

        <button
          onClick={handleSaveFields}
          disabled={savingFields}
          className="btn-primary flex items-center gap-2 py-2.5 px-5 mt-2">
          {savingFields ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
          Enregistrer
        </button>
      </div>
    </div>
  )
}
