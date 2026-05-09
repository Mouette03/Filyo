import nodePath from 'path'
import nodeFs from 'fs'

/** Logo Filyo encodé en base64 pour les emails (logo-email.png 64×64). */
export const EMAIL_LOGO_SRC = 'data:image/png;base64,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'

/** CSS dark mode pour les emails, à injecter dans une balise <style>. */
export const EMAIL_DARK_CSS = `@media (prefers-color-scheme: dark) {
  body { background-color: #0a0b14 !important; }
  .w { background-color: #0d0e1a !important; color: #e8eaf6 !important; }
  .an { color: #e8eaf6 !important; }
  .sl { color: #888 !important; }
  .lb { background-color: #1a1d30 !important; border-left-color: #7a8dff !important; color: #ccc !important; }
  .ca { background-color: #13152a !important; }
  .cr td { border-bottom-color: #2a2d4a !important; }
  .fl { color: #7a8dff !important; }
  .fs { color: #666 !important; }
  .fu { color: #555 !important; }
  .fi { color: #aaa !important; }
  .ft { color: #444 !important; }
}`

/** Retourne un emoji représentant le type MIME du fichier. */
export function mimeEmoji(mime: string): string {
  if (!mime) return '📎'
  if (mime.startsWith('image/')) return '🖼️'
  if (mime.startsWith('video/')) return '🎬'
  if (mime.startsWith('audio/')) return '🎵'
  if (mime === 'application/pdf') return '📄'
  if (/zip|rar|tar|7z|gz|bz2/.test(mime)) return '🗜️'
  if (/word|document/.test(mime) || mime === 'text/plain' || mime === 'text/markdown') return '📝'
  if (/spreadsheet|excel|csv/.test(mime)) return '📊'
  if (/presentation|powerpoint/.test(mime)) return '📊'
  return '📎'
}

/** Formate une taille en octets en chaîne lisible. */
export function formatFileSize(bytes: bigint | number, lang = 'en-GB'): string {
  const n = typeof bytes === 'bigint' ? Number(bytes) : bytes
  const fr = lang === 'fr-FR'
  if (n < 1024) return `${n} ${fr ? 'o' : 'B'}`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} ${fr ? 'Ko' : 'KB'}`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} ${fr ? 'Mo' : 'MB'}`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} ${fr ? 'Go' : 'GB'}`
}

// Cache en mémoire du logo encodé pour les emails (invalidé si logoUrl change)
let _cachedLogoUrl: string | null | undefined = undefined
let _cachedLogoDataUri: string = EMAIL_LOGO_SRC

/**
 * Retourne le logo à utiliser dans les emails sous forme de data URI base64.
 * Utilise settings.logoUrl si défini, sinon le logo par défaut EMAIL_LOGO_SRC.
 * Le résultat est mis en cache en mémoire et recalculé uniquement si logoUrl change.
 */
export function getEmailLogoSrc(settings: { logoUrl?: string | null }, uploadDir: string): string {
  if (settings.logoUrl === _cachedLogoUrl) return _cachedLogoDataUri
  _cachedLogoUrl = settings.logoUrl
  if (!settings.logoUrl) {
    _cachedLogoDataUri = EMAIL_LOGO_SRC
    return _cachedLogoDataUri
  }
  try {
    const filePath = nodePath.join(uploadDir, settings.logoUrl.replace(/^\/uploads\//, ''))
    const ext = nodePath.extname(filePath).slice(1).toLowerCase()
    const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext || 'png'}`
    _cachedLogoDataUri = `data:${mime};base64,${nodeFs.readFileSync(filePath).toString('base64')}`
  } catch {
    _cachedLogoDataUri = EMAIL_LOGO_SRC
  }
  return _cachedLogoDataUri
}
