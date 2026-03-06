import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import path from 'path'
import fs from 'fs-extra'
import { nanoid } from 'nanoid'
import nodemailer from 'nodemailer'
import { prisma } from '../lib/prisma'
import { z } from 'zod'
import { UPLOAD_DIR } from '../lib/config'

const AVATAR_DIR = path.join(UPLOAD_DIR, 'avatars')

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
})

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8)
})

export async function authRoutes(app: FastifyInstance) {
  // GET /api/auth/setup — vérifie si le premier utilisateur doit être créé
  app.get('/setup', async (_req, reply) => {
    const count = await prisma.user.count()
    return reply.send({ setupNeeded: count === 0 })
  })

  // POST /api/auth/login
  app.post('/login', async (req, reply) => {
    const body = loginSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ code: 'INVALID_DATA' })

    const user = await prisma.user.findUnique({ where: { email: body.data.email } })
    if (!user || !user.active) {
      req.log.warn({ email: body.data.email }, 'Login attempt failed')
      return reply.code(401).send({ code: 'INVALID_CREDENTIALS' })
    }

    const ok = await bcrypt.compare(body.data.password, user.password)
    if (!ok) {
      req.log.warn({ email: body.data.email }, 'Login attempt failed')
      return reply.code(401).send({ code: 'INVALID_CREDENTIALS' })
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } })
    req.log.info({ userId: user.id, email: user.email }, 'Login successful')

    const token = app.jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      { expiresIn: '7d' }
    )

    return reply.send({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, avatarUrl: user.avatarUrl ?? null } })
  })

  // GET /api/auth/me — vérifier le token
  app.get('/me', { onRequest: [app.authenticate] }, async (req: any) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, role: true, avatarUrl: true, createdAt: true, lastLogin: true, cleanupAfterDays: true }
    })
    if (!user) throw { statusCode: 401, code: 'NOT_FOUND' }
    return user
  })

  // POST /api/auth/register — premier utilisateur OU admin connecté
  app.post('/register', async (req, reply) => {
    const body = registerSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ code: 'INVALID_DATA' })

    const count = await prisma.user.count()
    // Le 1er utilisateur est toujours admin
    const role = count === 0 ? 'ADMIN' : 'USER'

    // Si ce n'est pas le premier, vérifier que l'appelant est admin OU que l'inscription libre est activée
    if (count > 0) {
      let isAdmin = false
      try {
        await req.jwtVerify()
        const caller = (req as any).user
        if (caller.role === 'ADMIN') isAdmin = true
      } catch { /* non authentifié */ }

      if (!isAdmin) {
        const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } })
        if (!settings?.allowRegistration) {
          return reply.code(403).send({ code: 'REGISTRATION_DISABLED' })
        }
      }
    }

    const existing = await prisma.user.findUnique({ where: { email: body.data.email } })
    if (existing) return reply.code(409).send({ code: 'EMAIL_TAKEN' })

    const hashed = await bcrypt.hash(body.data.password, 12)
    const user = await prisma.user.create({
      data: { email: body.data.email, name: body.data.name, password: hashed, role },
      select: { id: true, email: true, name: true, role: true, createdAt: true }
    })

    req.log.info({ email: user.email, role: user.role }, 'User created')
    return reply.code(201).send(user)
  })

  // POST /api/auth/avatar — uploader son avatar
  app.post('/avatar', { onRequest: [app.authenticate] }, async (req: any, reply) => {
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
    if (!allowed.includes(ext)) {
      return reply.code(400).send({ code: 'INVALID_FORMAT' })
    }
    const filename = `avatar_${req.user.id}_${nanoid(6)}${ext}`
    const filePath = path.join(AVATAR_DIR, filename)
    const chunks: Buffer[] = []
    for await (const chunk of data.file) chunks.push(chunk)
    await fs.writeFile(filePath, Buffer.concat(chunks))
    const avatarUrl = `/uploads/avatars/${filename}`
    await prisma.user.update({ where: { id: req.user.id }, data: { avatarUrl } })
    req.log.debug({ userId: req.user.id }, 'Avatar updated')
    return { avatarUrl }
  })

  // DELETE /api/auth/avatar — supprimer son avatar
  app.delete('/avatar', { onRequest: [app.authenticate] }, async (req: any, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { avatarUrl: true } })
    if (user?.avatarUrl) {
      const file = path.join(UPLOAD_DIR, user.avatarUrl.replace('/uploads/', ''))
      await fs.remove(file).catch(() => {})
    }
    await prisma.user.update({ where: { id: req.user.id }, data: { avatarUrl: null } })
    req.log.debug({ userId: req.user.id }, 'Avatar deleted')
    return { success: true }
  })

  // PATCH /api/auth/profile — mettre à jour son nom
  app.patch('/profile', { onRequest: [app.authenticate] }, async (req: any, reply) => {
    const { name } = req.body as { name?: string }
    if (!name?.trim()) return reply.code(400).send({ code: 'INVALID_NAME' })
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { name: name.trim() },
      select: { id: true, email: true, name: true, role: true, avatarUrl: true }
    })
    req.log.debug({ userId: req.user.id }, 'Profile updated')
    return updated
  })

  // POST /api/auth/change-password
  app.post('/change-password', { onRequest: [app.authenticate] }, async (req: any, reply) => {
    const { currentPassword, newPassword } = req.body as any
    if (!currentPassword || !newPassword || newPassword.length < 8) {
      return reply.code(400).send({ code: 'INVALID_DATA' })
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    if (!user) return reply.code(404).send({ code: 'NOT_FOUND' })
    const ok = await bcrypt.compare(currentPassword, user.password)
    if (!ok) return reply.code(400).send({ code: 'WRONG_PASSWORD' })
    const hashed = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({ where: { id: req.user.id }, data: { password: hashed } })
    req.log.info({ userId: req.user.id }, 'Password changed')
    return { success: true }
  })

  // PATCH /api/auth/cleanup-preference — préférence de nettoyage automatique
  app.patch('/cleanup-preference', { onRequest: [app.authenticate] }, async (req: any, reply) => {
    const { cleanupAfterDays } = req.body as { cleanupAfterDays: number | null }

    // Valider contre le maximum admin
    if (cleanupAfterDays != null) {
      const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } })
      const adminMax = settings?.cleanupAfterDays ?? null
      if (adminMax == null) {
        return reply.code(403).send({ code: 'CLEANUP_DISABLED' })
      }
      if (cleanupAfterDays < 0 || cleanupAfterDays > adminMax) {
        return reply.code(400).send({ code: 'CLEANUP_EXCEEDS_MAX', max: adminMax })
      }
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: { cleanupAfterDays }
    })
    req.log.debug({ userId: req.user.id, cleanupAfterDays }, 'Cleanup preference updated')
    return { cleanupAfterDays }
  })

  // POST /api/auth/forgot-password — demander un lien de réinitialisation
  app.post('/forgot-password', async (req, reply) => {
    const { email } = req.body as { email?: string }
    // Toujours répondre 200 pour ne pas révéler l'existence d'un compte
    if (!email) return reply.send({ success: true })

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return reply.send({ success: true })

    const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } })
    if (!settings?.smtpHost || !settings?.smtpFrom) {
      return reply.code(503).send({ code: 'SMTP_NOT_CONFIGURED' })
    }

    // Générer le token (1h de validité)
    const token = nanoid(40)
    const expiry = new Date(Date.now() + 60 * 60 * 1000)
    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExpiry: expiry }
    })

    const siteUrl = settings.siteUrl || `${req.protocol}://${req.hostname}`
    const resetUrl = `${siteUrl}/reset-password?token=${token}`
    const appName = settings.appName || 'Filyo'
    const smtpPort = settings.smtpPort ?? 587
    const smtpSecure = smtpPort === 465

    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      requireTLS: smtpPort === 587,
      auth: settings.smtpUser ? { user: settings.smtpUser, pass: settings.smtpPass ?? '' } : undefined
    })

    try {
      await transporter.sendMail({
        from: `"${appName}" <${settings.smtpFrom}>`,
        to: user.email,
        subject: `[${appName}] Réinitialisation de votre mot de passe`,
        text: `Bonjour ${user.name},\n\nVous avez demandé la réinitialisation de votre mot de passe.\n\nCliquez sur ce lien (valide 1h) :\n${resetUrl}\n\nSi vous n'avez pas fait cette demande, ignorez cet email.\n\nEnvoyé via ${appName}.`,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;background:#0d0e1a;color:#e8eaf6;padding:32px 24px;border-radius:16px">
            <h2 style="margin:0 0 6px;color:#7a8dff;font-size:20px">${appName}</h2>
            <p style="color:#aaa;font-size:13px;margin:0 0 24px">Réinitialisation de mot de passe</p>
            <p style="margin:0 0 12px">Bonjour <strong>${user.name}</strong>,</p>
            <p style="margin:0 0 24px;color:#ccc">Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous (lien valide <strong>1 heure</strong>).</p>
            <a href="${resetUrl}" style="display:inline-block;background:#5c6bfa;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px">Réinitialiser mon mot de passe</a>
            <p style="margin:24px 0 0;font-size:12px;color:#666">Si vous n'avez pas demandé cette réinitialisation, ignorez cet email. Votre mot de passe ne changera pas.</p>
            <p style="margin:16px 0 0;font-size:11px;color:#444">${appName}</p>
          </div>`
      })
    } catch (err: any) {
      req.log.error({ err: err.message }, 'Reset password email failed')
      return reply.code(502).send({ code: 'EMAIL_SEND_FAILED', detail: err.message })
    }

    return reply.send({ success: true })
  })

  // POST /api/auth/reset-password — appliquer le nouveau mot de passe
  app.post('/reset-password', async (req, reply) => {
    const { token, password } = req.body as { token?: string; password?: string }
    if (!token || !password || password.length < 8) {
      return reply.code(400).send({ code: 'INVALID_DATA' })
    }

    const user = await prisma.user.findFirst({
      where: { resetToken: token, resetTokenExpiry: { gt: new Date() } }
    })
    if (!user) return reply.code(400).send({ code: 'INVALID_RESET_TOKEN' })

    const hashed = await bcrypt.hash(password, 12)
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, resetToken: null, resetTokenExpiry: null }
    })
    req.log.info({ userId: user.id }, 'Password reset')
    return reply.send({ success: true })
  })
}
