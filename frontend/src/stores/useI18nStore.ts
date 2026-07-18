import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Lang = 'fr-FR' | 'en-GB' | 'de-DE' | 'es-ES' | 'it-IT'

/** Détecte la langue préférée du navigateur ; retourne une langue supportée. */
function detectBrowserLang(): Lang {
  const nav = (navigator.language || 'en-GB').slice(0, 2).toLowerCase()
  if (nav === 'fr') return 'fr-FR'
  if (nav === 'de') return 'de-DE'
  if (nav === 'es') return 'es-ES'
  if (nav === 'it') return 'it-IT'
  return 'en-GB'
}

interface I18nState {
  lang: Lang
  setLang: (lang: Lang) => void
}

/**
 * - Au premier accès (pas de valeur en localStorage) → langue du navigateur
 * - Aux accès suivants → préférence sauvegardée par zustand/persist
 */
export const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      lang: detectBrowserLang(),
      setLang: (lang) => set({ lang }),
    }),
    { name: 'filyo-lang' }
  )
)
