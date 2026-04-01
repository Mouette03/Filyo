import { en } from './en'
import { fr } from './fr'

/** Union type of all supported locale codes. */
export type SupportedLang = 'fr' | 'en'

type Translations = typeof fr

/** Registry mapping locale codes to their translation dictionaries. */
const translations: Record<string, Translations> = { en, fr }

/**
 * Escapes special HTML characters in a string to prevent injection in email bodies.
 * Covers `&`, `<`, `>`, `"`, and `'`.
 *
 * @example
 * escapeHtml('<script>alert(1)</script>') // => '&lt;script&gt;alert(1)&lt;/script&gt;'
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Translate an email string by key with optional variable interpolation.
 * Falls back to French if the requested language is not available.
 *
 * @example
 * t('en', 'email.forgotPassword.subject', { appName: 'Filyo' })
 * // => '[Filyo] Reset your password'
 */
export function t(lang: string, key: string, vars: Record<string, string | number> = {}): string {
  const dict = translations[lang] ?? translations['fr']
  const value = key.split('.').reduce((obj: any, k) => obj?.[k], dict)
  if (typeof value !== 'string') return key
  return value.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? `{{${k}}}`))
}
