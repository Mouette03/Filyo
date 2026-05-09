import { frFR } from './fr-FR'
import { enGB } from './en-GB'
import type { Lang } from '../stores/useI18nStore'
import { useI18nStore } from '../stores/useI18nStore'

export type TranslationKey = keyof typeof frFR

const translations: Record<Lang, Record<string, string>> = { 'fr-FR': frFR, 'en-GB': enGB }

/**
 * Retourne une fonction de traduction `t(key, vars?)` liée à la langue active.
 * Variables: t('toast.welcome', { name: 'Alice' }) → 'Bienvenue, Alice !'
 *
 * Ajouter une langue : créer src/i18n/<code>.ts, l'importer ici et l'ajouter dans `translations`.
 */
export function useT() {
  const { lang, setLang } = useI18nStore()
  const dict: Record<string, string> = translations[lang as Lang] ?? translations['en-GB']

  const t = (key: string, vars?: Record<string, string>): string => {
    let str = dict[key] ?? frFR[key as TranslationKey] ?? key
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        str = str.replace(`{{${k}}}`, v)
      })
    }
    return str
  }

  return { t, lang, setLang }
}

export { frFR as fr, enGB as en }
export type { Lang }
