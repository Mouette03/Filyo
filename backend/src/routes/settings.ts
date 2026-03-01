import { FastifyInstance } from 'fastify'
import path from 'path'
import fs from 'fs-extra'
import { nanoid } from 'nanoid'
import { prisma } from '../lib/prisma'

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/data/uploads'
const LOGO_DIR = path.join(UPLOAD_DIR, 'logos')

async function getSettings() {
  return prisma.appSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton', appName: 'Filyo' }
  })
}

export async function settingsRoutes(app: FastifyInstance) {
  // GET /api/settings — public (pour charger le nom/logo au démarrage), sans données SMTP
  app.get('/', async () => {
    const s = await getSettings()
    return {
      id: s.id,
      appName: s.appName,
      logoUrl: s.logoUrl,
      siteUrl: s.siteUrl ?? '',
      uploaderNameReq: s.uploaderNameReq ?? 'optional',
      uploaderEmailReq: s.uploaderEmailReq ?? 'optional',
      uploaderMsgReq: s.uploaderMsgReq ?? 'optional',
      updatedAt: s.updatedAt
    }
  })

  // GET /api/settings/smtp — config SMTP (admin uniquement)
  app.get('/smtp', { onRequest: [app.authenticate, app.adminOnly] }, async () => {
    const s = await getSettings()
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
    return { success: true, smtpHost: updated.smtpHost, smtpFrom: updated.smtpFrom }
  })

  // POST /api/settings/smtp/test — tester la connexion SMTP (admin uniquement)
  app.post('/smtp/test', { onRequest: [app.authenticate, app.adminOnly] }, async (req: any, reply) => {
    const s = await getSettings()
    if (!s.smtpHost || !s.smtpFrom) {
      return reply.code(400).send({ error: 'Configuration SMTP incomplète (hôte et expéditeur requis)' })
    }
    try {
      // Test de connexion simple via net.createConnection
      const net = await import('net')
      const port = s.smtpPort ?? 587
      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection(port, s.smtpHost!, () => { socket.destroy(); resolve() })
        socket.setTimeout(5000)
        socket.on('error', reject)
        socket.on('timeout', () => { socket.destroy(); reject(new Error('Timeout')) })
      })
      return { success: true, message: `Connexion réussie à ${s.smtpHost}:${port}` }
    } catch (err: any) {
      return reply.code(502).send({ error: `Connexion échouée : ${err.message}` })
    }
  })

  // PATCH /api/settings/name — changer le nom de l'app
  app.patch<{ Body: { appName: string } }>(
    '/name',
    { onRequest: [app.authenticate, app.adminOnly] },
    async (req, reply) => {
      const { appName } = req.body
      if (!appName?.trim()) return reply.code(400).send({ error: 'Nom invalide' })
      const settings = await prisma.appSettings.upsert({
        where: { id: 'singleton' },
        update: { appName: appName.trim() },
        create: { id: 'singleton', appName: appName.trim() }
      })
      return settings
    }
  )

  // PATCH /api/settings/uploader-fields — configurer les champs du formulaire déposant
  app.patch<{
    Body: { uploaderNameReq?: string; uploaderEmailReq?: string; uploaderMsgReq?: string }
  }>('/uploader-fields', { onRequest: [app.authenticate, app.adminOnly] }, async (req, reply) => {
    const valid = ['hidden', 'optional', 'required']
    const { uploaderNameReq, uploaderEmailReq, uploaderMsgReq } = req.body
    if (uploaderNameReq && !valid.includes(uploaderNameReq)) return reply.code(400).send({ error: 'Valeur invalide' })
    if (uploaderEmailReq && !valid.includes(uploaderEmailReq)) return reply.code(400).send({ error: 'Valeur invalide' })
    if (uploaderMsgReq && !valid.includes(uploaderMsgReq)) return reply.code(400).send({ error: 'Valeur invalide' })
    const updated = await prisma.appSettings.upsert({
      where: { id: 'singleton' },
      update: { uploaderNameReq, uploaderEmailReq, uploaderMsgReq },
      create: { id: 'singleton', appName: 'Filyo', uploaderNameReq, uploaderEmailReq, uploaderMsgReq }
    })
    return {
      uploaderNameReq: updated.uploaderNameReq,
      uploaderEmailReq: updated.uploaderEmailReq,
      uploaderMsgReq: updated.uploaderMsgReq
    }
  })

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
      return { siteUrl: settings.siteUrl ?? '' }
    }
  )

  // POST /api/settings/logo — uploader un logo
  app.post(
    '/logo',
    { onRequest: [app.authenticate, app.adminOnly] },
    async (req, reply) => {
      await fs.ensureDir(LOGO_DIR)

      // Supprimer l'ancien logo
      const current = await getSettings()
      if (current.logoUrl) {
        const oldFile = path.join(UPLOAD_DIR, current.logoUrl.replace('/uploads/', ''))
        await fs.remove(oldFile).catch(() => {})
      }

      const data = await req.file()
      if (!data) return reply.code(400).send({ error: 'Aucun fichier reçu' })

      const ext = path.extname(data.filename || '.png')
      const allowed = ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif']
      if (!allowed.includes(ext.toLowerCase())) {
        return reply.code(400).send({ error: 'Format non supporté (png, jpg, svg, webp, gif)' })
      }

      const filename = `logo_${nanoid(8)}${ext}`
      const filePath = path.join(LOGO_DIR, filename)

      const chunks: Buffer[] = []
      for await (const chunk of data.file) chunks.push(chunk)
      await fs.writeFile(filePath, Buffer.concat(chunks))

      const logoUrl = `/uploads/logos/${filename}`
      const settings = await prisma.appSettings.upsert({
        where: { id: 'singleton' },
        update: { logoUrl },
        create: { id: 'singleton', appName: 'Filyo', logoUrl }
      })
      return settings
    }
  )

  // DELETE /api/settings/logo — supprimer le logo
  app.delete(
    '/logo',
    { onRequest: [app.authenticate, app.adminOnly] },
    async () => {
      const current = await getSettings()
      if (current.logoUrl) {
        const file = path.join(UPLOAD_DIR, current.logoUrl.replace('/uploads/', ''))
        await fs.remove(file).catch(() => {})
      }
      return prisma.appSettings.upsert({
        where: { id: 'singleton' },
        update: { logoUrl: null },
        create: { id: 'singleton', appName: 'Filyo' }
      })
    }
  )
}
