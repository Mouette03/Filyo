import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { getAppSettings } from '../lib/appSettings.js'
import { setSessionCookie, isTwoFactorRequired } from '../lib/session.js'
import {
  CHALLENGE_MAX_ATTEMPTS,
  PENDING_SETUP_TTL_MS,
  buildOtpauthUrl,
  buildQrSvg,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  getTwoFactorKey,
  hashChallengeToken,
  hashRecoveryCode,
  normalizeRecoveryCode,
  verifyTotp
} from '../lib/twoFactor.js'

export const verifyLoginSchema = z.object({
  challengeToken: z.string().min(16).max(128),
  code: z.string().trim().min(6).max(32)
})

export const setupSchema = z.object({
  password: z.string().min(1)
})

export const enableSchema = z.object({
  code: z.string().trim().min(6).max(16)
})

export const reauthSchema = z.object({
  password: z.string().min(1),
  code: z.string().trim().min(6).max(32)
})

type SecondFactorUser = {
  id: string
  twoFactorSecret: string | null
  twoFactorLastUsedStep: number | null
}

/**
 * Vérifie un code TOTP ou un code de secours et le consomme de façon atomique.
 * - TOTP : la période acceptée est enregistrée ; un même code ne peut pas servir deux fois.
 * - Code de secours : marqué comme utilisé ; une seconde utilisation est refusée.
 */
async function consumeSecondFactor(user: SecondFactorUser, rawCode: string): Promise<'totp' | 'recovery' | null> {
  const code = rawCode.trim()
  if (/^\d[\d\s]*$/.test(code)) {
    if (!user.twoFactorSecret) return null
    const step = verifyTotp(decryptSecret(user.twoFactorSecret), code, user.twoFactorLastUsedStep)
    if (step == null) return null
    const updated = await prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [{ twoFactorLastUsedStep: null }, { twoFactorLastUsedStep: { lt: step } }]
      },
      data: { twoFactorLastUsedStep: step }
    })
    return updated.count === 1 ? 'totp' : null
  }
  if (!normalizeRecoveryCode(code)) return null
  const used = await prisma.twoFactorRecoveryCode.updateMany({
    where: { userId: user.id, codeHash: hashRecoveryCode(code), usedAt: null },
    data: { usedAt: new Date() }
  })
  return used.count === 1 ? 'recovery' : null
}

function publicUser(u: { id: string; email: string; name: string; role: string; avatarUrl: string | null; twoFactorEnabled: boolean }) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, avatarUrl: u.avatarUrl ?? null, twoFactorEnabled: u.twoFactorEnabled }
}

/**
 * Routes de la 2FA, montées sous /api/auth/2fa.
 *
 * POST /verify                      2e étape de connexion (challenge + code TOTP ou code de secours)
 * GET  /status                      état de la 2FA du compte connecté
 * POST /setup                       démarrer l'enrôlement (mot de passe requis) → QR code
 * POST /enable                      valider le premier code → 2FA active + codes de secours
 * POST /disable                     désactiver (mot de passe + code ; interdit si 2FA obligatoire)
 * POST /recovery-codes/regenerate   remplacer les codes de secours (mot de passe + code)
 */
export async function twoFactorRoutes(app: FastifyInstance) {
  // ── Connexion : deuxième étape ──────────────────────────────────────────
  app.post('/verify', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const body = verifyLoginSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ code: 'INVALID_DATA' })

    const now = new Date()
    const tokenHash = hashChallengeToken(body.data.challengeToken)
    const challenge = await prisma.twoFactorChallenge.findUnique({ where: { tokenHash } })
    if (!challenge || challenge.expiresAt <= now) {
      if (challenge) await prisma.twoFactorChallenge.deleteMany({ where: { id: challenge.id } })
      return reply.code(401).send({ code: 'TWO_FACTOR_CHALLENGE_EXPIRED' })
    }

    // Réserver une tentative de façon atomique (protège contre les essais parallèles)
    const reserved = await prisma.twoFactorChallenge.updateMany({
      where: { id: challenge.id, attempts: { lt: CHALLENGE_MAX_ATTEMPTS }, expiresAt: { gt: now } },
      data: { attempts: { increment: 1 } }
    })
    if (reserved.count === 0) {
      await prisma.twoFactorChallenge.deleteMany({ where: { id: challenge.id } })
      return reply.code(401).send({ code: 'TWO_FACTOR_CHALLENGE_EXPIRED' })
    }

    const user = await prisma.user.findUnique({ where: { id: challenge.userId } })
    if (!user || !user.active || !user.twoFactorEnabled || !user.twoFactorSecret) {
      await prisma.twoFactorChallenge.deleteMany({ where: { id: challenge.id } })
      return reply.code(401).send({ code: 'TWO_FACTOR_CHALLENGE_EXPIRED' })
    }

    const method = await consumeSecondFactor(user, body.data.code)
    if (!method) {
      const attemptsRemaining = Math.max(0, CHALLENGE_MAX_ATTEMPTS - (challenge.attempts + 1))
      if (attemptsRemaining === 0) await prisma.twoFactorChallenge.deleteMany({ where: { id: challenge.id } })
      req.log.warn({ userId: user.id, ip: req.ip, attemptsRemaining }, 'Two-factor verification failed')
      return reply.code(401).send({ code: 'INVALID_TWO_FACTOR_CODE', attemptsRemaining })
    }

    // Consommer le challenge (usage unique) — si une autre requête l'a déjà consommé, refuser
    const consumed = await prisma.twoFactorChallenge.deleteMany({ where: { id: challenge.id } })
    if (consumed.count !== 1) return reply.code(401).send({ code: 'TWO_FACTOR_CHALLENGE_EXPIRED' })

    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } })
    const recoveryCodesRemaining = await prisma.twoFactorRecoveryCode.count({ where: { userId: user.id, usedAt: null } })
    req.log.info({ userId: user.id, email: user.email, ip: req.ip, method }, 'Login successful (2FA)')

    setSessionCookie(app, reply, user)
    return reply.send({
      user: { ...publicUser(user), twoFactorSetupRequired: false },
      method,
      recoveryCodesRemaining
    })
  })

  // ── État de la 2FA ─────────────────────────────────────────────────────
  app.get('/status', {
    onRequest: [app.authenticate],
    config: { allowTwoFactorSetup: true }
  }, async (req) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { twoFactorEnabled: true, twoFactorEnabledAt: true }
    })
    const [required, recoveryCodesRemaining] = await Promise.all([
      isTwoFactorRequired(),
      prisma.twoFactorRecoveryCode.count({ where: { userId: req.user.id, usedAt: null } })
    ])
    return {
      enabled: user?.twoFactorEnabled ?? false,
      enabledAt: user?.twoFactorEnabledAt ?? null,
      required,
      recoveryCodesRemaining: user?.twoFactorEnabled ? recoveryCodesRemaining : 0
    }
  })

  // ── Enrôlement : étape 1 (QR code) ─────────────────────────────────────
  app.post('/setup', {
    onRequest: [app.authenticate],
    config: { allowTwoFactorSetup: true, rateLimit: { max: 10, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const body = setupSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ code: 'INVALID_DATA' })
    if (!getTwoFactorKey()) return reply.code(500).send({ code: 'ENCRYPTION_KEY_MISSING' })

    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    if (!user) return reply.code(404).send({ code: 'NOT_FOUND' })
    if (user.twoFactorEnabled) return reply.code(409).send({ code: 'TWO_FACTOR_ALREADY_ENABLED' })
    if (!await bcrypt.compare(body.data.password, user.password)) {
      return reply.code(400).send({ code: 'WRONG_PASSWORD' })
    }

    const secret = generateTotpSecret()
    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorPendingSecret: encryptSecret(secret),
        twoFactorPendingExpiry: new Date(Date.now() + PENDING_SETUP_TTL_MS)
      }
    })

    const settings = await getAppSettings()
    const issuer = (settings.appName || 'Filyo').replace(/:/g, '')
    const otpauthUrl = buildOtpauthUrl(secret, user.email, issuer)
    const qrSvg = await buildQrSvg(otpauthUrl)
    req.log.info({ userId: user.id }, 'Two-factor setup started')
    return { secret, otpauthUrl, qrSvg, expiresInSeconds: PENDING_SETUP_TTL_MS / 1000 }
  })

  // ── Enrôlement : étape 2 (premier code) ────────────────────────────────
  app.post('/enable', {
    onRequest: [app.authenticate],
    config: { allowTwoFactorSetup: true, rateLimit: { max: 10, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const body = enableSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ code: 'INVALID_DATA' })

    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    if (!user) return reply.code(404).send({ code: 'NOT_FOUND' })
    if (user.twoFactorEnabled) return reply.code(409).send({ code: 'TWO_FACTOR_ALREADY_ENABLED' })
    if (!user.twoFactorPendingSecret || !user.twoFactorPendingExpiry || user.twoFactorPendingExpiry <= new Date()) {
      return reply.code(400).send({ code: 'TWO_FACTOR_SETUP_EXPIRED' })
    }

    const step = verifyTotp(decryptSecret(user.twoFactorPendingSecret), body.data.code)
    if (step == null) return reply.code(400).send({ code: 'INVALID_TWO_FACTOR_CODE' })

    const recoveryCodes = generateRecoveryCodes()
    const [updated] = await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          twoFactorEnabled: true,
          twoFactorSecret: user.twoFactorPendingSecret,
          twoFactorPendingSecret: null,
          twoFactorPendingExpiry: null,
          twoFactorLastUsedStep: step,
          twoFactorEnabledAt: new Date(),
          // Les sessions ouvertes sans 2FA sur d'autres appareils sont révoquées
          sessionVersion: { increment: 1 }
        }
      }),
      prisma.twoFactorRecoveryCode.deleteMany({ where: { userId: user.id } }),
      prisma.twoFactorRecoveryCode.createMany({
        data: recoveryCodes.map(code => ({ userId: user.id, codeHash: hashRecoveryCode(code) }))
      })
    ])

    setSessionCookie(app, reply, updated)
    req.log.info({ userId: user.id }, 'Two-factor authentication enabled')
    return { recoveryCodes, user: { ...publicUser(updated), twoFactorSetupRequired: false } }
  })

  // ── Désactivation ──────────────────────────────────────────────────────
  app.post('/disable', {
    onRequest: [app.authenticate],
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const body = reauthSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ code: 'INVALID_DATA' })
    if (await isTwoFactorRequired()) return reply.code(403).send({ code: 'TWO_FACTOR_REQUIRED_BY_POLICY' })

    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    if (!user) return reply.code(404).send({ code: 'NOT_FOUND' })
    if (!user.twoFactorEnabled) return reply.code(400).send({ code: 'TWO_FACTOR_NOT_ENABLED' })
    if (!await bcrypt.compare(body.data.password, user.password)) {
      return reply.code(400).send({ code: 'WRONG_PASSWORD' })
    }
    if (!await consumeSecondFactor(user, body.data.code)) {
      return reply.code(400).send({ code: 'INVALID_TWO_FACTOR_CODE' })
    }

    const [updated] = await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorPendingSecret: null,
          twoFactorPendingExpiry: null,
          twoFactorLastUsedStep: null,
          twoFactorEnabledAt: null,
          sessionVersion: { increment: 1 }
        }
      }),
      prisma.twoFactorRecoveryCode.deleteMany({ where: { userId: user.id } }),
      prisma.twoFactorChallenge.deleteMany({ where: { userId: user.id } })
    ])

    setSessionCookie(app, reply, updated)
    req.log.info({ userId: user.id }, 'Two-factor authentication disabled')
    return { success: true }
  })

  // ── Régénération des codes de secours ──────────────────────────────────
  app.post('/recovery-codes/regenerate', {
    onRequest: [app.authenticate],
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const body = reauthSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ code: 'INVALID_DATA' })

    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    if (!user) return reply.code(404).send({ code: 'NOT_FOUND' })
    if (!user.twoFactorEnabled) return reply.code(400).send({ code: 'TWO_FACTOR_NOT_ENABLED' })
    if (!await bcrypt.compare(body.data.password, user.password)) {
      return reply.code(400).send({ code: 'WRONG_PASSWORD' })
    }
    if (!await consumeSecondFactor(user, body.data.code)) {
      return reply.code(400).send({ code: 'INVALID_TWO_FACTOR_CODE' })
    }

    const recoveryCodes = generateRecoveryCodes()
    await prisma.$transaction([
      prisma.twoFactorRecoveryCode.deleteMany({ where: { userId: user.id } }),
      prisma.twoFactorRecoveryCode.createMany({
        data: recoveryCodes.map(code => ({ userId: user.id, codeHash: hashRecoveryCode(code) }))
      })
    ])
    req.log.info({ userId: user.id }, 'Two-factor recovery codes regenerated')
    return { recoveryCodes }
  })
}
