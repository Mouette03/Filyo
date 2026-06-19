import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import path from 'path'
import fs from 'fs-extra'
import { nanoid } from 'nanoid'
import * as oidc from 'openid-client'
import { prisma } from '../lib/prisma'
import { z } from 'zod'
import { UPLOAD_DIR } from '../lib/config'
import { getAppSettings } from '../lib/appSettings'
import { createSmtpTransport } from '../lib/smtp'
import { t, escapeHtml, normalizeLang } from '../lib/i18n'
import { EMAIL_DARK_CSS, getEmailLogoSrc } from '../lib/emailHelpers'

const AVATAR_DIR = path.join(UPLOAD_DIR, 'avatars')

// ─── OIDC CONFIG ────────────────────────────────────────────────────────────
// OIDC est désactivé par défaut. Il est actif uniquement si OIDC_ISSUER_URL
// et OIDC_CLIENT_ID sont définis dans les variables d'environnement.

const OIDC_ENABLED =
  Boolean(process.env.OIDC_ISSUER_URL) &&
  Boolean(process.env.OIDC_CLIENT_ID) &&
  Boolean(process.env.OIDC_REDIRECT_URI)

const OIDC_ISSUER_URL     = process.env.OIDC_ISSUER_URL    ?? ''
const OIDC_CLIENT_ID      = process.env.OIDC_CLIENT_ID     ?? ''
const OIDC_CLIENT_SECRET  = process.env.OIDC_CLIENT_SECRET ?? ''
const OIDC_REDIRECT_URI   = process.env.OIDC_REDIRECT_URI  ?? ''
const OIDC_SCOPE          = process.env.OIDC_SCOPE         ?? 'openid email profile'
const OIDC_AUTO_REGISTER  = (process.env.OIDC_AUTO_REGISTER ?? 'auto_register') === 'auto_register'
const OIDC_DEFAULT_ROLE   = process.env.OIDC_DEFAULT_ROLE  ?? 'USER'
const OIDC_PROVIDER_NAME  = process.env.OIDC_PROVIDER_NAME ?? 'oidc'

// Configuration OIDC mise en cache au démarrage (une seule découverte .well-known)
let oidcConfig: oidc.Configuration | null = null

async function getOidcConfig() {
  if (oidcConfig) return oidcConfig
  oidcConfig = await oidc.discovery(
    new URL(OIDC_ISSUER_URL),
    OIDC_CLIENT_ID,
    OIDC_CLIENT_SECRET || undefined,
  )
  return oidcConfig
}

// ─── ZOD SCHEMAS ────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1)
})

const registerSchema = z.object({
  email:    z.string().email(),
  name:     z.string().min(1),
  password: z.string().min(8)
})

const profileSchema = z.object({
  name: z.string().trim().min(1)
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     z.string().min(8)
})

const cleanupPreferenceSchema = z.object({
  cleanupAfterDays: z.number().int().nonnegative().nullable()
})

const oidcLinkConfirmSchema = z.object({
  password:  z.string().min(1),
  linkToken: z.string().min(1),
})

// ─── HELPER : émet le cookie JWT Filyo ──────────────────────────────────────

function issueSessionCookie(
  app: FastifyInstance,
  reply: import('fastify').FastifyReply,
  user: { id: string; email: string; name: string; role: string; avatarUrl: string | null }
) {
  const token = app.jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    { expiresIn: '7d' }
  )
  reply.setCookie('token', token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path:     '/',
    maxAge:   60 * 60 * 24 * 7,
  })
  return { user: { id: user.id, email: user.email, name: user.name, role: user.role, avatarUrl: user.avatarUrl ?? null } }
}

// ─── STATE STORE OIDC (anti-CSRF, TTL 5 min) ────────────────────────────────

interface OidcStateData {
  codeVerifier: string
  expiresAt:    number
  pendingLink?: { email: string; sub: string; provider: string; name: string }
}
const oidcStateStore = new Map<string, OidcStateData>()

function pruneOidcStates() {
  const now = Date.now()
  for (const [k, v] of oidcStateStore.entries()) {
    if (v.expiresAt < now) oidcStateStore.delete(k)
  }
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

export async function authRoutes(app: FastifyInstance) {

  // GET /api/auth/setup
  app.get('/setup', async (_req, reply) => {
    const count = await prisma.user.count()
    return reply.send({ setupNeeded: count === 0 })
  })

  // POST /api/auth/login
  app.post('/login', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const body = loginSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ code: 'INVALID_DATA' })

    const user = await prisma.user.findUnique({ where: { email: body.data.email } })
    if (!user || !user.active) {
      req.log.warn({ email: body.data.email }, 'Login attempt failed')
      return reply.code(401).send({ code: 'INVALID_CREDENTIALS' })
    }

    // Compte OIDC-only : pas de mot de passe local
    if (!user.password) {
      req.log.warn({ email: body.data.email }, 'Login attempt on OIDC-only account')
      return reply.code(403).send({
        code:     'OIDC_ONLY_ACCOUNT',
        message:  "Ce compte utilise la connexion SSO. Le mot de passe est géré par votre fournisseur d'identité.",
        provider: user.oidcProvider ?? null,
      })
    }

    const ok = await bcrypt.compare(body.data.password, user.password)
    if (!ok) {
      req.log.warn({ email: body.data.email }, 'Login attempt failed')
      return reply.code(401).send({ code: 'INVALID_CREDENTIALS' })
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } })
    req.log.info({ userId: user.id, email: user.email }, 'Login successful')
    return reply.send(issueSessionCookie(app, reply, user))
  })

  // POST /api/auth/logout
  app.post('/logout', async (_req, reply) => {
    reply.clearCookie('token', { path: '/' })
    return reply.send({ ok: true })
  })

  // GET /api/auth/me
  app.get('/me', { onRequest: [app.authenticate] }, async (req) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, email: true, name: true, role: true, avatarUrl: true,
        createdAt: true, lastLogin: true, cleanupAfterDays: true,
        oidcProvider: true,
      }
    })
    if (!user) throw { statusCode: 401, code: 'NOT_FOUND' }
    return user
  })

  // POST /api/auth/register
  app.post('/register', async (req, reply) => {
    const body = registerSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ code: 'INVALID_DATA' })

    const count = await prisma.user.count()
    const role = count === 0 ? 'ADMIN' : 'USER'

    let isAdmin = false
    if (count > 0) {
      try {
        await req.jwtVerify()
        const caller = req.user
        if (caller.role === 'ADMIN') isAdmin = true
      } catch { /* non authentifié */ }

      if (!isAdmin) {
        const settings = await getAppSettings()
        if (!settings.allowRegistration) {
          return reply.code(403).send({ code: 'REGISTRATION_DISABLED' })
        }
      }
    }

    const existing = await prisma.user.findUnique({ where: { email: body.data.email } })
    if (existing) return reply.code(409).send({ code: 'EMAIL_TAKEN' })

    const isPublicRegistration = count > 0 && !isAdmin
    const _rawQuota    = (process.env.REGISTER_DEFAULT_QUOTA ?? '500MB').trim()
    const _gbMatch     = _rawQuota.match(/^(\d+(?:\.\d+)?)\s*GB$/i)
    const _mbMatch     = _rawQuota.match(/^(\d+(?:\.\d+)?)\s*MB?$/i)
    const _defaultQuotaMB = _gbMatch
      ? parseFloat(_gbMatch[1]) * 1024
      : _mbMatch ? parseFloat(_mbMatch[1]) : NaN
    const defaultQuotaBytes = Number.isFinite(_defaultQuotaMB) && _defaultQuotaMB > 0
      ? BigInt(Math.round(_defaultQuotaMB * 1024 * 1024))
      : null
    const storageQuotaBytes = isPublicRegistration ? defaultQuotaBytes : null

    const hashed = await bcrypt.hash(body.data.password, 12)
    const user = await prisma.user.create({
      data: { email: body.data.email, name: body.data.name, password: hashed, role, storageQuotaBytes },
      select: { id: true, email: true, name: true, role: true, createdAt: true }
    })

    req.log.info({ email: user.email, role: user.role }, 'User created')
    return reply.code(201).send(user)
  })

  // ─── ROUTES OIDC ───────────────────────────────────────────────────────────

  // GET /api/auth/oidc/config
  app.get('/oidc/config', async (_req, reply) => {
    return reply.send({
      enabled:      OIDC_ENABLED,
      issuerUrl:    OIDC_ENABLED ? OIDC_ISSUER_URL : null,
      clientId:     OIDC_ENABLED ? OIDC_CLIENT_ID  : null,
      providerName: OIDC_ENABLED ? OIDC_PROVIDER_NAME : null,
    })
  })

  // GET /api/auth/oidc/login
  app.get('/oidc/login', async (req, reply) => {
    if (!OIDC_ENABLED) return reply.code(404).send({ code: 'OIDC_DISABLED' })

    pruneOidcStates()
    const config         = await getOidcConfig()
    const state          = oidc.randomState()
    const codeVerifier   = oidc.randomPKCECodeVerifier()
    const codeChallenge  = await oidc.calculatePKCECodeChallenge(codeVerifier)

    oidcStateStore.set(state, {
      codeVerifier,
      expiresAt: Date.now() + 5 * 60 * 1000,
    })

    const authUrl = oidc.buildAuthorizationUrl(config, {
      redirect_uri:          OIDC_REDIRECT_URI,
      scope:                 OIDC_SCOPE,
      state,
      code_challenge:        codeChallenge,
      code_challenge_method: 'S256',
    })

    return reply.redirect(authUrl.href)
  })

  // GET /api/auth/oidc/callback
  app.get('/oidc/callback', async (req, reply) => {
    if (!OIDC_ENABLED) return reply.code(404).send({ code: 'OIDC_DISABLED' })

    pruneOidcStates()
    const config  = await getOidcConfig()
    const query   = req.query as Record<string, string>
    const state   = query.state ?? ''

    const stateData = oidcStateStore.get(state)
    if (!stateData || stateData.expiresAt < Date.now()) {
      return reply.redirect('/?error=OIDC_STATE_EXPIRED')
    }
    oidcStateStore.delete(state)

    let tokens: Awaited<ReturnType<typeof oidc.authorizationCodeGrant>>
    try {
      tokens = await oidc.authorizationCodeGrant(config, query, {
        expectedState: state,
        codeVerifier: stateData.codeVerifier,
      })
    } catch (err: any) {
      req.log.error({ err: err.message }, 'OIDC token exchange failed')
      return reply.redirect('/?error=OIDC_CALLBACK_FAILED')
    }

    const claims       = tokens.claims()
    const sub          = claims.sub
    const email        = (claims.email as string | undefined)?.toLowerCase().trim()
    const name         = (claims.name as string | undefined) ?? email ?? sub
    const emailVerified = claims.email_verified === true

    if (!email) return reply.redirect('/?error=OIDC_NO_EMAIL')

    // 1. Compte déjà lié par sub → connexion directe
    const byOidc = await prisma.user.findUnique({ where: { oidcSub: sub } })
    if (byOidc) {
      if (!byOidc.active) return reply.redirect('/?error=OIDC_ACCOUNT_DISABLED')
      await prisma.user.update({ where: { id: byOidc.id }, data: { lastLogin: new Date() } })
      req.log.info({ userId: byOidc.id }, 'OIDC login (existing link)')
      issueSessionCookie(app, reply, byOidc)
      return reply.redirect('/')
    }

    // 2. Email existant → liaison explicite requise
    const byEmail = await prisma.user.findUnique({ where: { email } })
    if (byEmail) {
      if (!emailVerified) return reply.redirect('/?error=OIDC_EMAIL_NOT_VERIFIED')
      const linkToken = oidc.randomState()
      oidcStateStore.set(linkToken, {
        codeVerifier: '',
        expiresAt: Date.now() + 5 * 60 * 1000,
        pendingLink: { email, sub, provider: OIDC_PROVIDER_NAME, name },
      })
      req.log.info({ email }, 'OIDC link required for existing account')
      return reply.redirect(`/oidc/callback?link=1&email=${encodeURIComponent(email)}&token=${linkToken}`)
    }

    // 3. Email inconnu → création automatique si OIDC_AUTO_REGISTER
    if (!OIDC_AUTO_REGISTER) return reply.redirect('/?error=OIDC_REGISTRATION_DISABLED')

    const count = await prisma.user.count()
    const role  = count === 0 ? 'ADMIN' : OIDC_DEFAULT_ROLE

    const isPublicRegistration = count > 0
    const _rawQuota    = (process.env.REGISTER_DEFAULT_QUOTA ?? '500MB').trim()
    const _gbMatch     = _rawQuota.match(/^(\d+(?:\.\d+)?)\s*GB$/i)
    const _mbMatch     = _rawQuota.match(/^(\d+(?:\.\d+)?)\s*MB?$/i)
    const _defaultQuotaMB = _gbMatch
      ? parseFloat(_gbMatch[1]) * 1024
      : _mbMatch ? parseFloat(_mbMatch[1]) : NaN
    const defaultQuotaBytes = Number.isFinite(_defaultQuotaMB) && _defaultQuotaMB > 0
      ? BigInt(Math.round(_defaultQuotaMB * 1024 * 1024))
      : null
    const storageQuotaBytes = isPublicRegistration ? defaultQuotaBytes : null

    const newUser = await prisma.user.create({
      data: {
        email,
        name,
        password:     null,
        role,
        oidcSub:      sub,
        oidcProvider: OIDC_PROVIDER_NAME,
        storageQuotaBytes,
      }
    })

    req.log.info({ userId: newUser.id, email, role }, 'OIDC user created')
    await prisma.user.update({ where: { id: newUser.id }, data: { lastLogin: new Date() } })
    issueSessionCookie(app, reply, newUser)
    return reply.redirect('/')
  })

  // POST /api/auth/oidc/link — confirme la liaison compte local + OIDC
  app.post('/oidc/link', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    if (!OIDC_ENABLED) return reply.code(404).send({ code: 'OIDC_DISABLED' })

    const parsed = oidcLinkConfirmSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ code: 'INVALID_DATA' })

    pruneOidcStates()
    const stateData = oidcStateStore.get(parsed.data.linkToken)
    if (!stateData || stateData.expiresAt < Date.now() || !stateData.pendingLink) {
      return reply.code(400).send({ code: 'OIDC_LINK_TOKEN_EXPIRED' })
    }

    const { email, sub, provider } = stateData.pendingLink
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !user.active) return reply.code(401).send({ code: 'INVALID_CREDENTIALS' })
    if (!user.password) return reply.code(403).send({ code: 'OIDC_ONLY_ACCOUNT' })

    const ok = await bcrypt.compare(parsed.data.password, user.password)
    if (!ok) return reply.code(401).send({ code: 'INVALID_CREDENTIALS' })

    oidcStateStore.delete(parsed.data.linkToken)
    await prisma.user.update({
      where: { id: user.id },
      data:  { oidcSub: sub, oidcProvider: provider, lastLogin: new Date() },
    })
    req.log.info({ userId: user.id, provider }, 'OIDC account linked')
    return reply.send(issueSessionCookie(app, reply, user))
  })

  // ─── ROUTES PROFIL ─────────────────────────────────────────────────────────

  // POST /api/auth/avatar
  app.post('/avatar', { onRequest: [app.authenticate] }, async (req, reply) => {
    await fs.ensureDir(AVATAR_DIR)
    const current = await prisma.user.findUnique({ where: { id: req.user.id }, select: { avatarUrl: true } })
    if (current?.avatarUrl) {
      const oldFile = path.join(UPLOAD_DIR, current.avatarUrl.replace('/uploads/', ''))
      await fs.remove(oldFile).catch(() => {})
    }
    const data = await req.file()
    if (!data) return reply.code(400).send({ code: 'NO_FILE' })
    const ext = path.extname(data.filename || '.jpg').toLowerCase()
    const allowed = ['.png', '.jpg', '.jpeg', '.webp', '.gif']
    if (!allowed.includes(ext)) return reply.code(400).send({ code: 'INVALID_FORMAT' })

    const filename = `avatar_${req.user.id}_${nanoid(6)}${ext}`
    const filePath = path.join(AVATAR_DIR, filename)
    const MAX_BYTES = 3 * 1024 * 1024
    const ws = fs.createWriteStream(filePath)
    let received = 0
    try {
      for await (const chunk of data.file) {
        received += chunk.length
        if (received > MAX_BYTES) {
          ws.destroy()
          await fs.remove(filePath).catch(() => {})
          return reply.code(413).send({ code: 'FILE_TOO_LARGE', maxBytes: MAX_BYTES })
        }
        if (!ws.write(chunk)) await new Promise<void>((resolve, reject) => {
          ws.once('drain', resolve)
          ws.once('error', reject)
        })
      }
      await new Promise<void>((resolve, reject) => {
        ws.end()
        ws.once('finish', resolve)
        ws.once('error', reject)
      })
    } catch (err) {
      ws.destroy()
      await fs.remove(filePath).catch(() => {})
      throw err
    }
    const avatarUrl = `/uploads/avatars/${filename}`
    await prisma.user.update({ where: { id: req.user.id }, data: { avatarUrl } })
    req.log.debug({ userId: req.user.id }, 'Avatar updated')
    return { avatarUrl }
  })

  // DELETE /api/auth/avatar
  app.delete('/avatar', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { avatarUrl: true } })
    if (user?.avatarUrl) {
      const file = path.join(UPLOAD_DIR, user.avatarUrl.replace('/uploads/', ''))
      await fs.remove(file).catch(() => {})
    }
    await prisma.user.update({ where: { id: req.user.id }, data: { avatarUrl: null } })
    req.log.debug({ userId: req.user.id }, 'Avatar deleted')
    return { success: true }
  })

  // PATCH /api/auth/profile
  app.patch('/profile', { onRequest: [app.authenticate] }, async (req, reply) => {
    const parsed = profileSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ code: 'INVALID_NAME' })
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data:  { name: parsed.data.name },
      select: { id: true, email: true, name: true, role: true, avatarUrl: true }
    })
    req.log.debug({ userId: req.user.id }, 'Profile updated')
    return updated
  })

  // POST /api/auth/change-password
  app.post('/change-password', { onRequest: [app.authenticate] }, async (req, reply) => {
    const parsed = changePasswordSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ code: 'INVALID_DATA' })

    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    if (!user) return reply.code(404).send({ code: 'NOT_FOUND' })

    if (!user.password) {
      return reply.code(403).send({
        code:     'OIDC_MANAGED_ACCOUNT',
        message:  "Le mot de passe de ce compte est géré par votre fournisseur d'identité SSO.",
        provider: user.oidcProvider ?? null,
      })
    }

    const ok = await bcrypt.compare(parsed.data.currentPassword, user.password)
    if (!ok) return reply.code(400).send({ code: 'WRONG_PASSWORD' })
    const hashed = await bcrypt.hash(parsed.data.newPassword, 12)
    await prisma.user.update({ where: { id: req.user.id }, data: { password: hashed } })
    req.log.info({ userId: req.user.id }, 'Password changed')
    return { success: true }
  })

  // PATCH /api/auth/cleanup-preference
  app.patch('/cleanup-preference', { onRequest: [app.authenticate] }, async (req, reply) => {
    const parsed = cleanupPreferenceSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ code: 'INVALID_DATA' })
    const { cleanupAfterDays } = parsed.data

    if (cleanupAfterDays != null) {
      const settings = await getAppSettings()
      const adminMax = settings.cleanupAfterDays ?? null
      if (adminMax == null) return reply.code(403).send({ code: 'CLEANUP_DISABLED' })
      if (cleanupAfterDays < 0 || cleanupAfterDays > adminMax) {
        return reply.code(400).send({ code: 'CLEANUP_EXCEEDS_MAX', max: adminMax })
      }
    }

    await prisma.user.update({ where: { id: req.user.id }, data: { cleanupAfterDays } })
    req.log.debug({ userId: req.user.id, cleanupAfterDays }, 'Cleanup preference updated')
    return { cleanupAfterDays }
  })

  // POST /api/auth/forgot-password
  app.post('/forgot-password', {
    config: { rateLimit: { max: 5, timeWindow: '5 minutes' } }
  }, async (req, reply) => {
    const body = req.body as Record<string, unknown>
    const email = typeof body?.email === 'string' ? body.email.trim() : null
    const lang  = normalizeLang(body?.lang)
    if (!email) return reply.send({ success: true })

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return reply.send({ success: true })

    // Compte OIDC-only : pas de reset local
    if (!user.password) {
      req.log.info({ email }, 'Forgot-password attempt on OIDC-only account — ignored')
      return reply.code(403).send({
        code:     'OIDC_MANAGED_ACCOUNT',
        message:  "Ce compte utilise la connexion SSO. La réinitialisation du mot de passe est gérée par votre fournisseur d'identité.",
        provider: user.oidcProvider ?? null,
      })
    }

    const settings = await getAppSettings()
    if (!settings.smtpHost || !settings.smtpFrom) {
      return reply.code(503).send({ code: 'SMTP_NOT_CONFIGURED' })
    }
    const emailLogoSrc = getEmailLogoSrc(settings, UPLOAD_DIR)

    const token  = nanoid(40)
    const expiry = new Date(Date.now() + 60 * 60 * 1000)
    await prisma.user.update({ where: { id: user.id }, data: { resetToken: token, resetTokenExpiry: expiry } })

    const siteUrl   = settings.siteUrl || `${req.protocol}://${req.hostname}`
    const resetUrl  = `${siteUrl}/reset-password?token=${token}`
    const appName   = settings.appName || 'Filyo'
    const safeAppName  = escapeHtml(appName)
    const safeUserName = escapeHtml(user.name)
    const safeResetUrl = escapeHtml(encodeURI(resetUrl))

    const transporter = createSmtpTransport(settings)

    try {
      await transporter.sendMail({
        from:    `"${appName}" <${settings.smtpFrom}>`,
        to:      user.email,
        subject: t(lang, 'email.forgotPassword.subject', { appName }),
        text:    t(lang, 'email.forgotPassword.text', { name: user.name, resetUrl, appName }),
        html: `<!DOCTYPE html><html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>${EMAIL_DARK_CSS}</style>
</head>
<body style="margin:0;padding:20px 8px;background:#eef0f5">
<div class="w" style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;background:#ffffff;color:#1a1a2e;padding:28px 24px;border-radius:16px">
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:6px"><tr>
    <td width="46" valign="middle"><img src="${emailLogoSrc}" width="36" height="36" alt="${safeAppName}" style="border-radius:9px;display:block"></td>
    <td valign="middle"><span class="an" style="font-size:17px;font-weight:700;color:#1a1a2e">${safeAppName}</span></td>
  </tr></table>
  <p class="sl" style="color:#666;font-size:13px;margin:0 0 24px">${t(lang, 'email.forgotPassword.htmlSubtitle')}</p>
  <p style="margin:0 0 12px">${t(lang, 'email.forgotPassword.htmlGreeting')} <strong>${safeUserName}</strong>,</p>
  <p style="margin:0 0 24px;color:#777" class="sl">${t(lang, 'email.forgotPassword.htmlBody')}</p>
  <a href="${safeResetUrl}" style="display:inline-block;background:#5c6bfa;color:#ffffff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px">${t(lang, 'email.forgotPassword.htmlButton')}</a>
  <p style="margin:22px 0 0;font-size:12px;color:#888" class="fs">${t(lang, 'email.forgotPassword.htmlDisclaimer')}</p>
  <p style="margin:14px 0 0;font-size:11px;color:#bbb" class="ft">${safeAppName}</p>
</div>
</body>
</html>`
      })
    } catch (err: any) {
      req.log.error({ err: err.message }, 'Reset password email failed')
      return reply.code(502).send({ code: 'EMAIL_SEND_FAILED', detail: err.message })
    }

    req.log.info({ userId: user.id }, 'Password reset email sent')
    return reply.send({ success: true })
  })

  // GET /api/auth/quota
  app.get('/quota', { onRequest: [app.authenticate] }, async (req) => {
    const user = await prisma.user.findUnique({
      where:  { id: req.user.id },
      select: { storageQuotaBytes: true }
    })
    const [filesAgg, receivedAgg] = await Promise.all([
      prisma.file.aggregate({ _sum: { size: true }, where: { userId: req.user.id } }),
      prisma.receivedFile.aggregate({
        _sum:  { size: true },
        where: { uploadRequest: { userId: req.user.id } }
      })
    ])
    const storageUsedBytes = (
      (filesAgg._sum.size ?? BigInt(0)) + (receivedAgg._sum.size ?? BigInt(0))
    ).toString()
    return {
      storageQuotaBytes: user?.storageQuotaBytes?.toString() ?? null,
      storageUsedBytes
    }
  })

  // POST /api/auth/reset-password
  app.post('/reset-password', async (req, reply) => {
    const { token, password } = req.body as { token?: string; password?: string }
    if (!token || !password || password.length < 8) {
      return reply.code(400).send({ code: 'INVALID_DATA' })
    }

    const user = await prisma.user.findFirst({
      where: { resetToken: token, resetTokenExpiry: { gt: new Date() } }
    })
    if (!user) return reply.code(400).send({ code: 'INVALID_RESET_TOKEN' })

    // Sécurité : les comptes OIDC-only ne peuvent pas reset leur mot de passe ici
    if (!user.password && user.oidcSub) {
      return reply.code(403).send({ code: 'OIDC_MANAGED_ACCOUNT' })
    }

    const hashed = await bcrypt.hash(password, 12)
    await prisma.user.update({
      where: { id: user.id },
      data:  { password: hashed, resetToken: null, resetTokenExpiry: null }
    })
    req.log.info({ userId: user.id }, 'Password reset')
    return reply.send({ success: true })
  })
}
