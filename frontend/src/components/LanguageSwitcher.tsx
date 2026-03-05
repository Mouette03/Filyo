import { useT } from '../i18n'
import type { Lang } from '../stores/useI18nStore'

const LANGUAGES: { code: Lang; label: string; flag: string }[] = [
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  // ↑ Ajouter ici les prochaines langues
]

interface Props {
  /** 'compact' : bouton petit pour la barre de nav | 'full' : dropdown complet pour la page de connexion */
  variant?: 'compact' | 'full'
}

export default function LanguageSwitcher({ variant = 'compact' }: Props) {
  const { lang, setLang } = useT()

  if (variant === 'compact') {
    // Bouton compact qui cycle entre les langues disponibles
    const current = LANGUAGES.find(l => l.code === lang) ?? LANGUAGES[0]
    const next = LANGUAGES[(LANGUAGES.findIndex(l => l.code === lang) + 1) % LANGUAGES.length]

    return (
      <button
        onClick={() => setLang(next.code)}
        title={`${current.label} → ${next.label}`}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white/50 hover:text-white hover:bg-white/5 transition-colors"
      >
        <span className="text-base leading-none">{current.flag}</span>
        <span className="hidden sm:inline uppercase">{current.code}</span>
      </button>
    )
  }

  // Variant 'full' : boutons pour chaque langue
  return (
    <div className="flex items-center justify-center gap-2">
      {LANGUAGES.map(l => (
        <button
          key={l.code}
          onClick={() => setLang(l.code)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            lang === l.code
              ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
              : 'text-white/40 hover:text-white/70 hover:bg-white/5 border border-transparent'
          }`}
        >
          <span className="text-base leading-none">{l.flag}</span>
          <span>{l.label}</span>
        </button>
      ))}
    </div>
  )
}
