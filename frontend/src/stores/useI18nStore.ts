import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Lang = 'fr' | 'en'

/** Détecte la langue préférée du navigateur ; retourne 'fr' ou 'en'. */
function detectBrowserLang(): Lang {
  const nav = (navigator.language || 'fr').slice(0, 2).toLowerCase()
  return nav === 'fr' ? 'fr' : 'en'
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
