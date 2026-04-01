import { useRef, useState, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { useT } from '../i18n'
import type { Lang } from '../stores/useI18nStore'

// ↓ Ajouter une entrée ici pour chaque nouvelle langue supportée
export const LANGUAGES: { code: Lang; label: string; flag: string }[] = [
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'en', label: 'English',  flag: '🇬🇧' },
]

export default function LanguageSwitcher() {
  const { lang, setLang } = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const current = LANGUAGES.find(l => l.code === lang) ?? LANGUAGES[0]

  // Fermer si clic en dehors
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white/50 hover:text-white hover:bg-white/5 transition-colors"
      >
        <span className="text-base leading-none">{current.flag}</span>
        <span className="hidden sm:inline uppercase tracking-wide">{current.code}</span>
        <ChevronDown
          size={12}
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-40 rounded-xl border border-white/10 bg-surface-800 shadow-xl shadow-black/40 py-1 z-50">
          {LANGUAGES.map(l => (
            <button
              key={l.code}
              onClick={() => { setLang(l.code); setOpen(false) }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                lang === l.code
                  ? 'text-brand-400 bg-brand-500/10'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="text-base leading-none">{l.flag}</span>
              <span className="font-medium">{l.label}</span>
              {lang === l.code && (
                <span className="ml-auto text-brand-400 text-xs">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
