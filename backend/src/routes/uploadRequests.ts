import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import path from 'path'
import fs from 'fs-extra'
import { nanoid } from 'nanoid'
import { isValidEmail } from '../lib/utils'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { UPLOAD_DIR } from '../lib/config'
import { getAppSettings } from '../lib/appSettings'
import { createSmtpTransport } from '../lib/smtp'
import { t, escapeHtml } from '../lib/i18n'
import { createDlToken, consumeDlToken } from '../lib/dlTokens'
import { createRequestsTusServer } from '../lib/tus'

/**
 * Register HTTP routes under `/api/upload-requests` to create, manage and consume upload requests and their files.
 *
 * Registers endpoints for:
 * - creating and listing a user's upload requests (authenticated),
 * - retrieving public request info (public),
 * - depositing files to a request (public, with optional password and size/quantity constraints),
 * - listing and downloading received files (owner or admin),
 * - toggling request active state (owner or admin),
 * - sending deposit emails (owner or admin, via configured SMTP),
 * - deleting a request and its stored files (owner or admin).
 *
 * Side effects: persists upload requests and received-file records in the database, stores uploaded files on disk,
 * and may send email via SMTP.
 */
export async function uploadRequestRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }
  const tusServer = createRequestsTusServer(app)

  /** Construit le filtre Prisma pour un upload request : admin voit tout, owner voit le sien. */
  function ownerWhere(req: FastifyRequest, id: string) {
    return req.user.role === 'ADMIN'
      ? { id }
      : { id, userId: req.user.id }
  }

  // POST /api/upload-requests - Creer une demande (authentifie)
  app.post<{
    Body: {
      title: string
      message?: string
      password?: string
      expiresIn?: string
      maxFiles?: string
      maxSizeMb?: string
    }
  }>('/', auth, async (req, reply) => {
    const { title, message, password, expiresIn, maxFiles, maxSizeMb } = req.body
    const userId: string = req.user.id

    const hashedPassword = password ? await bcrypt.hash(password, 10) : null
    const expiresAt = expiresIn
      ? new Date(Date.now() + parseInt(expiresIn) * 1000)
      : null

    const request = await prisma.uploadRequest.create({
      data: {
        token: nanoid(16),
        title,
        message: message || null,
        password: hashedPassword,
        expiresAt,
        maxFiles: maxFiles ? parseInt(maxFiles) : null,
        maxSizeBytes: maxSizeMb ? BigInt(Math.round(parseFloat(maxSizeMb) * 1024 * 1024)) : null,
        userId
      }
    })

    req.log.info({ userId, token: request.token, title }, 'Upload request created')
    return reply.code(201).send({
      id: request.id,
      token: request.token,
      title: request.title,
      expiresAt: request.expiresAt
    })
  })

  // GET /api/upload-requests - Lister les demandes de l utilisateur courant
  app.get('/', auth, async (req) => {
    const requests = await prisma.uploadRequest.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { receivedFiles: true } } }
    })
    return requests.map((r: any) => ({
      ...r,
      maxSizeBytes: r.maxSizeBytes?.toString(),
      filesCount: r._count.receivedFiles
    }))
  })

  // GET /api/upload-requests/:token/info - Info publique (pas d auth)
  app.get<{ Params: { token: string } }>('/:token/info', async (req, reply) => {
    const request = await prisma.uploadRequest.findUnique({
      where: { token: req.params.token }
    })
    if (!request) {
      return reply.code(404).send({ code: 'REQUEST_NOT_FOUND' })
    }
    if (!request.active) {
      return reply.code(410).send({ code: 'REQUEST_INACTIVE' })
    }
    if (request.expiresAt && request.expiresAt < new Date()) {
      return reply.code(410).send({ code: 'REQUEST_EXPIRED' })
    }
    if (request.maxFiles) {
      const receivedCount = await prisma.receivedFile.count({ where: { uploadRequestId: request.id } })
      if (receivedCount >= request.maxFiles) {
        return reply.code(410).send({ code: 'REQUEST_LIMIT_REACHED' })
      }
    }

    return {
      token: request.token,
      title: request.title,
      message: request.message,
      expiresAt: request.expiresAt,
      hasPassword: !!request.password,
      maxFiles: request.maxFiles,
      maxSizeBytes: request.maxSizeBytes?.toString()
    }
  })

  // GET /api/upload-requests/dl/:dlToken — streaming direct (pas d'auth, token prouve l'autorisation)
  app.get<{ Params: { dlToken: string } }>('/dl/:dlToken', async (req, reply) => {
    const entry = consumeDlToken(req.params.dlToken)
    if (!entry) return reply.code(410).send({ code: 'DL_TOKEN_INVALID' })

    const fileExists = await fs.pathExists(entry.path)
    if (!fileExists) return reply.code(404).send({ code: 'FILE_MISSING' })

    if (entry.onDownload) await entry.onDownload()

    const stream = fs.createReadStream(entry.path)
    reply.header('Content-Type', entry.mimeType)
    reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(entry.filename)}"`)
    reply.header('Content-Length', entry.size.toString())
    return reply.send(stream)
  })

  // POST /api/upload-requests/:id/received/:fileId/dl-token — token de téléchargement court-vivant (propriétaire ou admin)
  app.post<{ Params: { id: string; fileId: string } }>('/:id/received/:fileId/dl-token', auth, async (req, reply) => {
    const where = ownerWhere(req, req.params.id)
    const request = await prisma.uploadRequest.findFirst({ where })
    if (!request) return reply.code(403).send({ code: 'FORBIDDEN' })

    const file = await prisma.receivedFile.findFirst({
      where: { id: req.params.fileId, uploadRequestId: req.params.id }
    })
    if (!file) return reply.code(404).send({ code: 'FILE_NOT_FOUND' })

    const fileExists = await fs.pathExists(file.path)
    if (!fileExists) return reply.code(404).send({ code: 'FILE_MISSING' })

    const dlToken = createDlToken({
      path: file.path,
      filename: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
    })

    req.log.debug({ id: req.params.id, fileId: req.params.fileId, userId: req.user.id }, 'Received file dl-token issued')
    return { dlToken }
  })

  // GET /api/upload-requests/:id/files - Fichiers recus (proprietaire ou admin)
  app.get<{ Params: { id: string } }>('/:id/files', auth, async (req, reply) => {
    const where = ownerWhere(req, req.params.id)
    const request = await prisma.uploadRequest.findFirst({ where })
    if (!request) return reply.code(403).send({ code: 'FORBIDDEN' })

    const files = await prisma.receivedFile.findMany({
      where: { uploadRequestId: req.params.id },
      orderBy: { uploadedAt: 'desc' }
    })
    return files.map((f: any) => ({ ...f, size: f.size.toString() }))
  })

  // PATCH /api/upload-requests/:id/toggle (proprietaire ou admin)
  app.patch<{ Params: { id: string } }>('/:id/toggle', auth, async (req, reply) => {
    const where = ownerWhere(req, req.params.id)
    const request = await prisma.uploadRequest.findFirst({ where })
    if (!request) return reply.code(403).send({ code: 'FORBIDDEN' })
    const updated = await prisma.uploadRequest.update({
      where: { id: req.params.id },
      data: { active: !request.active }
    })
    req.log.debug({ id: req.params.id, active: updated.active }, 'Upload request toggled')
    return { active: updated.active }
  })

  // PATCH /api/upload-requests/:id/expiry (propriétaire ou admin)
  app.patch<{ Params: { id: string }; Body: { expiresAt: string | null } }>(
    '/:id/expiry',
    auth,
    async (req, reply) => {
      const where = ownerWhere(req, req.params.id)
      const request = await prisma.uploadRequest.findFirst({ where })
      if (!request) return reply.code(404).send({ code: 'REQUEST_NOT_FOUND' })
      let expiresAt: Date | null = null
      if (req.body.expiresAt) {
        expiresAt = new Date(req.body.expiresAt)
        if (isNaN(expiresAt.getTime())) return reply.code(400).send({ code: 'INVALID_DATE' })
      }
      // Si on prolonge avec une date future, on réactive automatiquement
      const shouldReactivate = expiresAt === null || expiresAt > new Date()
      await prisma.uploadRequest.update({
        where: { id: req.params.id },
        data: { expiresAt, ...(shouldReactivate ? { active: true } : {}) }
      })
      req.log.info({ id: req.params.id, active: shouldReactivate || undefined }, 'Upload request expiry updated')
      return { expiresAt, active: shouldReactivate ? true : request.active }
    }
  )

  // POST /api/upload-requests/:id/send-email (proprietaire ou admin)
  app.post<{ Params: { id: string }; Body: { to: string; lang?: string } }>(
    '/:id/send-email',
    {
      ...auth,
      config: {
        rateLimit: {
          hook: 'preHandler',
          max: 10,
          timeWindow: '10 minutes',
          keyGenerator: (req) => req.user?.id ?? req.ip,
        },
      },
    },
    async (req, reply) => {
      const { to, lang = 'fr' } = req.body
      const MAX_RECIPIENTS = 10
      const raw: string[] = (to || '').split(',').map((s: string) => s.trim()).filter(Boolean)
      const addresses: string[] = [...new Set(raw)]
      if (addresses.length === 0 || addresses.some(a => !isValidEmail(a))) {
        return reply.code(400).send({ code: 'EMAIL_INVALID' })
      }
      if (addresses.length > MAX_RECIPIENTS) {
        return reply.code(400).send({ code: 'TOO_MANY_RECIPIENTS', max: MAX_RECIPIENTS })
      }
      const where = ownerWhere(req, req.params.id)
      const request = await prisma.uploadRequest.findFirst({ where })
      if (!request) return reply.code(403).send({ code: 'FORBIDDEN' })

      const settings = await getAppSettings()
      if (!settings.smtpHost || !settings.smtpFrom) {
        return reply.code(503).send({ code: 'SMTP_NOT_CONFIGURED' })
      }
      const baseUrl = (settings.siteUrl || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '')
      const depositUrl = `${baseUrl}/r/${request.token}`
      const appName = settings.appName || 'Filyo'
      const transporter = createSmtpTransport(settings)
      const messageBlock = request.message ? request.message + '\n\n' : ''
      const subject = t(lang, 'email.uploadRequest.subject', { appName, title: request.title })
      const bodyText = t(lang, 'email.uploadRequest.text', { title: request.title, message: messageBlock, depositUrl, appName })
      const safeTitle = escapeHtml(request.title)
      const safeMessage = request.message ? escapeHtml(request.message) : null
      const safeAppName = escapeHtml(appName)
      const safeDepositUrl = escapeHtml(encodeURI(depositUrl))
      try {
        await transporter.sendMail({
          from: `"${appName}" <${settings.smtpFrom}>`,
          to: 'undisclosed-recipients:;',
          bcc: addresses.join(', '),
          subject,
          text: bodyText,
          html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;background:#0d0e1a;color:#e8eaf6;padding:32px 24px;border-radius:16px">
          <h2 style="margin:0 0 6px;color:#7a8dff;font-size:20px">${safeAppName}</h2>
          <p style="color:#aaa;font-size:13px;margin:0 0 24px">${t(lang, 'email.uploadRequest.htmlSubtitle')}</p>
          <p style="margin:0 0 8px">${t(lang, 'email.uploadRequest.htmlBody')} <strong>${safeTitle}</strong></p>
          ${safeMessage ? `<p style="margin:0 0 16px;color:#ccc;font-style:italic">"${safeMessage}"</p>` : ''}
          <a href="${safeDepositUrl}" style="display:inline-block;background:#5c6bfa;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px">${t(lang, 'email.uploadRequest.htmlButton')}</a>
          <p style="margin:12px 0 0;font-size:12px;color:#666;font-family:monospace">${safeDepositUrl}</p>
          <p style="margin:24px 0 0;font-size:11px;color:#444">${safeAppName}</p>
        </div>`
        })
      } catch (err: any) {
        req.log.error({ err: err.message }, 'Upload request email failed')
        return reply.code(502).send({ code: 'EMAIL_SEND_FAILED', detail: err.message })
      }
      req.log.info({ id: req.params.id, recipientCount: addresses.length }, 'Upload request email sent')
      return { success: true }
    }
  )

  // DELETE /api/upload-requests/:id (proprietaire ou admin)
  app.delete<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const where = ownerWhere(req, req.params.id)
    const request = await prisma.uploadRequest.findFirst({ where })
    if (!request) return reply.code(403).send({ code: 'FORBIDDEN' })

    const files = await prisma.receivedFile.findMany({ where: { uploadRequestId: request.id } })
    for (const f of files) {
      await fs.remove(f.path).catch(() => {})
    }
    const requestDir = path.join(UPLOAD_DIR, 'received', request.id)
    await fs.remove(requestDir).catch(() => {})
    await prisma.uploadRequest.delete({ where: { id: req.params.id } })
    req.log.info({ id: req.params.id }, 'Upload request deleted')
    return { success: true }
  })

  // ── Upload TUS (resumable, public) ────────────────────────────────────────
  // Les requêtes TUS pour un upload request public sont transmises au serveur TUS.
  // Le requestToken est passé dans les métadonnées TUS par le client.
  const handleTus = async (req: FastifyRequest, reply: FastifyReply) => {
    reply.hijack()
    await new Promise<void>((resolve) => {
      tusServer.handle(req.raw, reply.raw)
      reply.raw.once('finish', resolve)
      reply.raw.once('close', resolve)
    })
  }

  // Extrait le requestToken depuis Upload-Metadata (format TUS : "key base64val,key base64val,...")
  const getRequestToken = (req: FastifyRequest): string | null => {
    const meta = (req.headers['upload-metadata'] as string | undefined) ?? ''
    for (const part of meta.split(',')) {
      const [key, val] = part.trim().split(' ')
      if (key === 'requestToken' && val) {
        try { return Buffer.from(val, 'base64').toString('utf8') } catch { return null }
      }
    }
    return null
  }

  // POST /tus : 1 appel = 1 fichier initié. Clé = IP:requestToken → les uploaders
  // vers des liens différents ne se bloquent pas mutuellement, même depuis le même NAT.
  app.all('/tus', {
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute',
        keyGenerator: (req) => {
          const token = getRequestToken(req)
          return token ? `${req.ip}:${token}` : req.ip
        }
      }
    }
  }, handleTus)
  app.all('/tus/*', { config: { rateLimit: { max: 300, timeWindow: '1 minute', keyGenerator: (req) => req.ip } } }, handleTus)
}
