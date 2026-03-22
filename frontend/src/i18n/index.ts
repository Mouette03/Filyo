import { fr } from './fr'
import { en } from './en'
import type { Lang } from '../stores/useI18nStore'
import { useI18nStore } from '../stores/useI18nStore'

export type TranslationKey = keyof typeof fr

const translations: Record<Lang, Record<string, string>> = { fr, en }

/**
 * Retourne une fonction de traduction `t(key, vars?)` liée à la langue active.
 * Variables: t('toast.welcome', { name: 'Alice' }) → 'Bienvenue, Alice !'
 *
 * Ajouter une langue : créer src/i18n/<code>.ts, l'importer ici et l'ajouter dans `translations`.
 */
export function useT() {
  const { lang, setLang } = useI18nStore()
  const dict: Record<string, string> = translations[lang as Lang] ?? translations['fr']

  const t = (key: string, vars?: Record<string, string>): string => {
    let str = dict[key] ?? fr[key as TranslationKey] ?? key
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        str = str.replace(`{{${k}}}`, v)
      })
    }
    return str
  }

  return { t, lang, setLang }
}

export { fr, en }
export type { Lang }
