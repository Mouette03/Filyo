import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto'
import QRCode from 'qrcode'
import { encrypt, decrypt } from './crypto.js'

/**
 * Authentification à deux facteurs (TOTP, RFC 6238) — utilitaires sans état.
 *
 * - Secret TOTP : 20 octets aléatoires (160 bits), encodés en Base32 pour les applications.
 * - Stockage : le secret est chiffré (AES-256-GCM) avec TWO_FACTOR_ENCRYPTION_KEY,
 *   ou JWT_SECRET à défaut (même mécanisme que le mot de passe SMTP).
 * - Codes de secours : empreintes HMAC-SHA256, jamais stockés en clair.
 */

export const TOTP_PERIOD_SECONDS = 30
export const TOTP_DIGITS = 6
/** Tolérance de décalage d'horloge : ±1 période (±30 s) */
export const TOTP_WINDOW = 1
export const RECOVERY_CODE_COUNT = 10
/** Durée de vie d'un challenge de connexion (mot de passe validé, code attendu) */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000
/** Nombre maximal de codes erronés par challenge */
export const CHALLENGE_MAX_ATTEMPTS = 5
/** Durée de vie d'un enrôlement en attente (QR code affiché, premier code non encore saisi) */
export const PENDING_SETUP_TTL_MS = 10 * 60 * 1000

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
// Alphabet des codes de secours : sans 0/O/1/I/L pour éviter les confusions à la lecture
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

// ── Clé de chiffrement ──────────────────────────────────────────────────────

/** Retourne la clé utilisée pour chiffrer les secrets 2FA, ou null si aucune n'est configurée. */
export function getTwoFactorKey(): string | null {
  return process.env.TWO_FACTOR_ENCRYPTION_KEY || process.env.JWT_SECRET || null
}

function requireKey(): string {
  const key = getTwoFactorKey()
  if (!key) throw new Error('TWO_FACTOR_ENCRYPTION_KEY or JWT_SECRET must be set')
  return key
}

export function encryptSecret(secret: string): string {
  return encrypt(secret, requireKey())
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith('enc:')) throw new Error('Two-factor secret is not encrypted')
  return decrypt(stored, requireKey())
}

// ── Base32 (RFC 4648, sans padding) ─────────────────────────────────────────

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char)
    if (idx === -1) throw new Error('Invalid base32 character')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

// ── TOTP ────────────────────────────────────────────────────────────────────

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

export function currentStep(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS)
}

/** HOTP (RFC 4226) — HMAC-SHA1, troncature dynamique. */
export function hotp(secretBase32: string, counter: number, digits: number = TOTP_DIGITS): string {
  const key = base32Decode(secretBase32)
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac('sha1', key).update(msg).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const bin = ((hmac[offset] & 0x7f) << 24)
    | (hmac[offset + 1] << 16)
    | (hmac[offset + 2] << 8)
    | hmac[offset + 3]
  return String(bin % 10 ** digits).padStart(digits, '0')
}

export function totp(secretBase32: string, nowMs: number = Date.now()): string {
  return hotp(secretBase32, currentStep(nowMs))
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

/** Normalise un code TOTP saisi (espaces retirés). Retourne null si le format est invalide. */
export function normalizeTotpCode(code: string): string | null {
  const clean = code.replace(/\s+/g, '')
  return /^\d{6}$/.test(clean) ? clean : null
}

/**
 * Vérifie un code TOTP dans la fenêtre de tolérance.
 * Retourne la période (step) correspondante, ou null si le code est invalide.
 * Les périodes <= lastUsedStep sont refusées pour empêcher le rejeu d'un code déjà accepté.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  lastUsedStep: number | null = null,
  nowMs: number = Date.now()
): number | null {
  const normalized = normalizeTotpCode(code)
  if (!normalized) return null
  const now = currentStep(nowMs)
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta++) {
    const step = now + delta
    if (lastUsedStep != null && step <= lastUsedStep) continue
    if (safeEqual(hotp(secretBase32, step), normalized)) return step
  }
  return null
}

export function buildOtpauthUrl(secretBase32: string, accountName: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`)
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS)
  })
  return `otpauth://totp/${label}?${params.toString()}`
}

/** QR code SVG (chaîne), affiché côté client sous forme d'image data: */
export async function buildQrSvg(otpauthUrl: string): Promise<string> {
  return QRCode.toString(otpauthUrl, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 })
}

// ── Codes de secours ────────────────────────────────────────────────────────

/** Génère un code de secours lisible, format XXXXX-XXXXX (~49 bits d'entropie). */
export function generateRecoveryCode(): string {
  let raw = ''
  for (let i = 0; i < 10; i++) raw += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]
  return `${raw.slice(0, 5)}-${raw.slice(5)}`
}

export function generateRecoveryCodes(count: number = RECOVERY_CODE_COUNT): string[] {
  const codes = new Set<string>()
  while (codes.size < count) codes.add(generateRecoveryCode())
  return [...codes]
}

/** Normalise un code de secours saisi (casse, espaces, tirets). Retourne null si le format est invalide. */
export function normalizeRecoveryCode(code: string): string | null {
  const clean = code.toUpperCase().replace(/[\s-]+/g, '')
  if (clean.length !== 10) return null
  for (const c of clean) if (!RECOVERY_ALPHABET.includes(c)) return null
  return clean
}

export function hashRecoveryCode(code: string): string {
  const normalized = normalizeRecoveryCode(code)
  if (!normalized) throw new Error('Invalid recovery code format')
  return createHmac('sha256', requireKey()).update(`filyo-recovery:${normalized}`).digest('hex')
}

// ── Challenges de connexion ─────────────────────────────────────────────────

/** Jeton opaque transmis au client entre l'étape mot de passe et l'étape code. */
export function generateChallengeToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Seule l'empreinte du jeton est stockée en base. */
export function hashChallengeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
