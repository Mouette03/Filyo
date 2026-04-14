import { nanoid } from 'nanoid'

export interface DlTokenEntry {
  path: string
  filename: string
  mimeType: string
  size: bigint
  expiresAt: number
  onDownload?: () => Promise<void>
}

const store = new Map<string, DlTokenEntry>()

// Nettoyage des tokens expirés toutes les minutes
const cleanupInterval = setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) store.delete(key)
  }
}, 60_000)
cleanupInterval.unref()

/** Crée un token de téléchargement à usage unique, valide TTL millisecondes (défaut 60s). */
export function createDlToken(entry: Omit<DlTokenEntry, 'expiresAt'>, ttlMs = 60_000): string {
  const token = nanoid(32)
  store.set(token, { ...entry, expiresAt: Date.now() + ttlMs })
  return token
}

/**
 * Consomme un token (single-use).
 * Retourne l'entrée si le token est valide et non expiré, null sinon.
 */
export function consumeDlToken(token: string): Omit<DlTokenEntry, 'expiresAt'> | null {
  const entry = store.get(token)
  if (!entry) return null
  store.delete(token) // toujours supprimer, expiré ou non
  if (Date.now() > entry.expiresAt) return null
  const { expiresAt: _, ...rest } = entry
  return rest
}
