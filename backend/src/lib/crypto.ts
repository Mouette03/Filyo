import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function deriveKey(secret: string): Buffer {
  // SHA-256 → 32 bytes pour AES-256
  return createHash('sha256').update(secret).digest()
}

/**
 * Chiffre une chaîne avec AES-256-GCM.
 * Retourne une chaîne préfixée "enc:" pour distinguer les valeurs chiffrées des valeurs en clair.
 */
export function encrypt(text: string, secret: string): string {
  const key = deriveKey(secret)
  const iv = randomBytes(12) // 96 bits recommandé pour GCM
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Déchiffre une chaîne chiffrée par encrypt().
 * Si la valeur ne commence pas par "enc:", elle est retournée telle quelle (rétrocompatibilité).
 */
export function decrypt(stored: string, secret: string): string {
  if (!stored.startsWith('enc:')) return stored // valeur en clair existante (rétrocompatibilité)
  const parts = stored.split(':')
  if (parts.length !== 4) throw new Error('Invalid encrypted value format')
  const [, ivHex, tagHex, dataHex] = parts
  const key = deriveKey(secret)
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return decipher.update(Buffer.from(dataHex, 'hex')).toString('utf8') + decipher.final('utf8')
}
