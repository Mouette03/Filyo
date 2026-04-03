import { FastifyInstance } from 'fastify'
import path from 'path'
import fs from 'fs-extra'
import { nanoid } from 'nanoid'
import sharp from 'sharp'
import { prisma } from '../lib/prisma'
import { UPLOAD_DIR } from '../lib/config'
import { getAppSettings } from '../lib/appSettings'

const LOGO_DIR = path.join(UPLOAD_DIR, 'logos')

/**
 * Register settings-related HTTP routes on the given Fastify instance.
 *
 * Exposes public and admin endpoints for reading and updating application settings,
 * including SMTP configuration, registration/cleanup/name/uploader-field/site-url updates,
 * and uploading/deleting the application logo. Admin routes are protected using the
 * instance's authentication and admin-only hooks.
 *
 * Notes:
 * - The logo upload endpoint streams files to disk and enforces a 2 MB maximum size.
 * - Settings are persisted to a singleton database record and read via the application's
 *   settings accessor.
 */
export async function settingsRoutes(app: FastifyInstance) {
  // GET /api/settings — public (pour charger le nom/logo au démarrage), sans données SMTP
  app.get('/', async () => {
    const s = await getAppSettings()
    return {
      id: s.id,
      appName: s.appName,
      logoUrl: s.logoUrl,
      siteUrl: s.siteUrl ?? '',
      uploaderNameReq: s.uploaderNameReq ?? 'optional',
      uploaderEmailReq: s.uploaderEmailReq ?? 'optional',
      uploaderMsgReq: s.uploaderMsgReq ?? 'optional',
      allowRegistration: s.allowRegistration ?? false,
      cleanupAfterDays: s.cleanupAfterDays ?? null,
      maxFileSizeBytes: s.maxFileSizeBytes ? s.maxFileSizeBytes.toString() : null,
      updatedAt: s.updatedAt
    }
  })

  // GET /api/settings/smtp — config SMTP (admin uniquement)
  app.get('/smtp', { onRequest: [app.authenticate, app.adminOnly] }, async () => {
    const s = await getAppSettings()
    return {
      smtpHost: s.smtpHost ?? '',
      smtpPort: s.smtpPort ?? 587,
      smtpFrom: s.smtpFrom ?? '',
      smtpUser: s.smtpUser ?? '',
      smtpPass: s.smtpPass ?? '',
      smtpSecure: s.smtpSecure ?? true
    }
  })

  // PATCH /api/settings/smtp — sauvegarder la config SMTP (admin uniquement)
  app.patch<{
    Body: {
      smtpHost?: string; smtpPort?: number; smtpFrom?: string
      smtpUser?: string; smtpPass?: string; smtpSecure?: boolean
    }
  }>('/smtp', { onRequest: [app.authenticate, app.adminOnly] }, async (req, reply) => {
    const { smtpHost, smtpPort, smtpFrom, smtpUser, smtpPass, smtpSecure } = req.body
    const updated = await prisma.appSettings.upsert({
      where: { id: 'singleton' },
      update: { smtpHost, smtpPort, smtpFrom, smtpUser, smtpPass, smtpSecure },
      create: {
        id: 'singleton', appName: 'Filyo',
        smtpHost, smtpPort, smtpFrom, smtpUser, smtpPass, smtpSecure: smtpSecure ?? true
      }
    })
    req.log.info({ smtpHost }, 'SMTP configuration updated')
    return { success: true, smtpHost: updated.smtpHost, smtpFrom: updated.smtpFrom }
  })

  // POST /api/settings/smtp/test — tester la connexion SMTP (admin uniquement)
  app.post<{ Body: { smtpHost?: string; smtpFrom?: string; smtpPort?: number } }>(
    '/smtp/test',
    { onRequest: [app.authenticate, app.adminOnly] },
    async (req, reply) => {
    // Priorité aux valeurs envoyées dans le body (formulaire non encore sauvegardé)
    const body = req.body ?? {}
    const s = await getAppSettings()
    const host = body.smtpHost || s.smtpHost
    const from = body.smtpFrom || s.smtpFrom
    const port: number = body.smtpPort ?? s.smtpPort ?? 587

    if (!host || !from) {
      return reply.code(400).send({ code: 'SMTP_INCOMPLETE' })
    }
    try {
      const net = await import('net')
      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection(port, host, () => { socket.destroy(); resolve() })
        socket.setTimeout(5000)
        socket.on('error', reject)
        socket.on('timeout', () => { socket.destroy(); reject(new Error('Timeout')) })
      })
      req.log.debug({ host, port }, 'SMTP test successful')
      return { success: true, code: 'SMTP_OK', host, port }
    } catch (err: any) {
      req.log.warn({ host, port, err: (err as any).message }, 'SMTP test failed')
      return reply.code(502).send({ code: 'SMTP_FAILED', detail: (err as any).message })
    }
  })

  // PATCH /api/settings/registration — activer/désactiver l'inscription libre
  app.patch<{ Body: { allowRegistration: boolean } }>(
    '/registration',
    { onRequest: [app.authenticate, app.adminOnly] },
    async (req, reply) => {
      const { allowRegistration } = req.body
      if (typeof allowRegistration !== 'boolean') return reply.code(400).send({ code: 'INVALID_VALUE' })
      const s = await prisma.appSettings.upsert({
        where: { id: 'singleton' },
        update: { allowRegistration },
        create: { id: 'singleton', appName: 'Filyo', allowRegistration }
      })
      req.log.info({ allowRegistration }, 'Registration setting updated')
      return { allowRegistration: s.allowRegistration }
    }
  )

  // PATCH /api/settings/cleanup — délai de nettoyage automatique
  app.patch<{ Body: { cleanupAfterDays: number | null } }>(
    '/cleanup',
    { onRequest: [app.authenticate, app.adminOnly] },
    async (req, reply) => {
      const { cleanupAfterDays } = req.body
      if (cleanupAfterDays !== null && (typeof cleanupAfterDays !== 'number' || cleanupAfterDays < 0)) {
        return reply.code(400).send({ code: 'INVALID_VALUE' })
      }
      const s = await prisma.appSettings.upsert({
        where: { id: 'singleton' },
        update: { cleanupAfterDays },
        create: { id: 'singleton', appName: 'Filyo', cleanupAfterDays }
      })
      req.log.info({ cleanupAfterDays }, 'Cleanup setting updated')
      return { cleanupAfterDays: s.cleanupAfterDays }
    }
  )

  // PATCH /api/settings/name — changer le nom de l'app
  app.patch<{ Body: { appName: string } }>(
    '/name',
    { onRequest: [app.authenticate, app.adminOnly] },
    async (req, reply) => {
      const { appName } = req.body
      if (!appName?.trim()) return reply.code(400).send({ code: 'INVALID_NAME' })
      const settings = await prisma.appSettings.upsert({
        where: { id: 'singleton' },
        update: { appName: appName.trim() },
        create: { id: 'singleton', appName: appName.trim() }
      })
      req.log.info({ appName }, 'Application name updated')
      return { appName: settings.appName, logoUrl: settings.logoUrl }
    }
  )

  // PATCH /api/settings/uploader-fields — configurer les champs du formulaire déposant
  app.patch<{
    Body: { uploaderNameReq?: string; uploaderEmailReq?: string; uploaderMsgReq?: string }
  }>('/uploader-fields', { onRequest: [app.authenticate, app.adminOnly] }, async (req, reply) => {
    const valid = ['hidden', 'optional', 'required']
    const { uploaderNameReq, uploaderEmailReq, uploaderMsgReq } = req.body
    if (uploaderNameReq && !valid.includes(uploaderNameReq)) return reply.code(400).send({ code: 'INVALID_VALUE' })
    if (uploaderEmailReq && !valid.includes(uploaderEmailReq)) return reply.code(400).send({ code: 'INVALID_VALUE' })
    if (uploaderMsgReq && !valid.includes(uploaderMsgReq)) return reply.code(400).send({ code: 'INVALID_VALUE' })
    const updated = await prisma.appSettings.upsert({
      where: { id: 'singleton' },
      update: { uploaderNameReq, uploaderEmailReq, uploaderMsgReq },
      create: { id: 'singleton', appName: 'Filyo', uploaderNameReq, uploaderEmailReq, uploaderMsgReq }
    })
    req.log.debug({ uploaderNameReq, uploaderEmailReq, uploaderMsgReq }, 'Uploader fields updated')
    return {
      uploaderNameReq: updated.uploaderNameReq,
      uploaderEmailReq: updated.uploaderEmailReq,
      uploaderMsgReq: updated.uploaderMsgReq
    }
  })

  // PATCH /api/settings/max-file-size — taille max par fichier (admin)
  app.patch<{ Body: { maxFileSizeBytes: number | null } }>(
    '/max-file-size',
    { onRequest: [app.authenticate, app.adminOnly] },
    async (req, reply) => {
      const { maxFileSizeBytes } = req.body
      if (maxFileSizeBytes !== null && (typeof maxFileSizeBytes !== 'number' || maxFileSizeBytes <= 0)) {
        return reply.code(400).send({ code: 'INVALID_VALUE' })
      }
      const s = await prisma.appSettings.upsert({
        where: { id: 'singleton' },
        update: { maxFileSizeBytes: maxFileSizeBytes ? BigInt(maxFileSizeBytes) : null },
        create: { id: 'singleton', appName: 'Filyo', maxFileSizeBytes: maxFileSizeBytes ? BigInt(maxFileSizeBytes) : null }
      })
      req.log.info({ maxFileSizeBytes }, 'Max file size updated')
      return { maxFileSizeBytes: s.maxFileSizeBytes ? s.maxFileSizeBytes.toString() : null }
    }
  )

  // PATCH /api/settings/site-url — changer l'URL publique du site
  app.patch<{ Body: { siteUrl: string } }>(
    '/site-url',
    { onRequest: [app.authenticate, app.adminOnly] },
    async (req, reply) => {
      const { siteUrl } = req.body
      const settings = await prisma.appSettings.upsert({
        where: { id: 'singleton' },
        update: { siteUrl: siteUrl?.trim() || null },
        create: { id: 'singleton', appName: 'Filyo', siteUrl: siteUrl?.trim() || null }
      })
      req.log.info({ siteUrl: settings.siteUrl }, 'Site URL updated')
      return { siteUrl: settings.siteUrl ?? '' }
    }
  )

  // POST /api/settings/logo — uploader un logo
  app.post(
    '/logo',
    { onRequest: [app.authenticate, app.adminOnly] },
    async (req, reply) => {
      await fs.ensureDir(LOGO_DIR)

      // Mémoriser l'ancien chemin avant tout traitement
      const current = await getAppSettings()
      const oldFile = current.logoUrl
        ? path.join(UPLOAD_DIR, current.logoUrl.replace('/uploads/', ''))
        : null

      const data = await req.file()
      if (!data) return reply.code(400).send({ code: 'NO_FILE' })

      const ext = path.extname(data.filename || '.png').toLowerCase()
      const allowed = ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif']
      if (!allowed.includes(ext)) {
        return reply.code(400).send({ code: 'INVALID_FORMAT' })
      }

      // Lire les chunks en mémoire (max 2 MB)
      const MAX_BYTES = 2 * 1024 * 1024
      const chunks: Buffer[] = []
      let received = 0
      for await (const chunk of data.file) {
        received += chunk.length
        if (received > MAX_BYTES) {
          // vider le stream
          data.file.resume()
          return reply.code(413).send({ code: 'FILE_TOO_LARGE', maxBytes: MAX_BYTES })
        }
        chunks.push(chunk)
      }
      const inputBuffer = Buffer.concat(chunks)

      // Convertir en PNG 180×180 — compatible favicon + apple-touch-icon
      // Fallback : si sharp échoue (ex. SVG sans librsvg), sauvegarder tel quel
      let filename: string
      let filePath: string
      try {
        filename = `logo_${nanoid(8)}.png`
        filePath = path.join(LOGO_DIR, filename)
        await sharp(inputBuffer)
          .resize(180, 180, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toFile(filePath)
        req.log.debug({ filename }, 'Logo converted to PNG 180x180')
      } catch (convErr) {
        req.log.warn({ err: (convErr as Error).message }, 'sharp conversion failed, saving original file')
        filename = `logo_${nanoid(8)}${ext}`
        filePath = path.join(LOGO_DIR, filename)
        await fs.writeFile(filePath, inputBuffer)
      }

      const logoUrl = `/uploads/logos/${filename}`
      const settings = await prisma.appSettings.upsert({
        where: { id: 'singleton' },
        update: { logoUrl },
        create: { id: 'singleton', appName: 'Filyo', logoUrl }
      })

      // Supprimer l'ancien logo seulement après que le nouveau est persisté
      if (oldFile) await fs.remove(oldFile).catch(() => {})

      req.log.info({ logoUrl }, 'Logo uploaded')
      return { appName: settings.appName, logoUrl: settings.logoUrl }
    }
  )

  // DELETE /api/settings/logo — supprimer le logo
  app.delete(
    '/logo',
    { onRequest: [app.authenticate, app.adminOnly] },
    async (req) => {
      const current = await getAppSettings()
      if (current.logoUrl) {
        const file = path.join(UPLOAD_DIR, current.logoUrl.replace('/uploads/', ''))
        await fs.remove(file).catch(() => {})
      }
      const result = await prisma.appSettings.upsert({
        where: { id: 'singleton' },
        update: { logoUrl: null },
        create: { id: 'singleton', appName: 'Filyo' }
      })
      req.log.info('Logo deleted')
      return { appName: result.appName, logoUrl: result.logoUrl }
    }
  )
}
