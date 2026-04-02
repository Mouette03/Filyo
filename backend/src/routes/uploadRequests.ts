import { FastifyInstance, FastifyRequest } from 'fastify'
import path from 'path'
import fs from 'fs-extra'
import { nanoid } from 'nanoid'
import mime from 'mime-types'
import { isValidEmail } from '../lib/utils'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { UPLOAD_DIR } from '../lib/config'
import { getAppSettings } from '../lib/appSettings'
import { createSmtpTransport } from '../lib/smtp'
import { t, escapeHtml } from '../lib/i18n'

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
    if (!request || !request.active) {
      return reply.code(404).send({ code: 'REQUEST_NOT_FOUND' })
    }
    if (request.expiresAt && request.expiresAt < new Date()) {
      return reply.code(410).send({ code: 'REQUEST_EXPIRED' })
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

  // POST /api/upload-requests/:token/upload - Deposer des fichiers (public)
  app.post<{ Params: { token: string } }>('/:token/upload', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const request = await prisma.uploadRequest.findUnique({
      where: { token: req.params.token },
      include: { _count: { select: { receivedFiles: true } } }
    })
    if (!request || !request.active) {
      return reply.code(404).send({ code: 'REQUEST_NOT_FOUND' })
    }
    if (request.expiresAt && request.expiresAt < new Date()) {
      return reply.code(410).send({ code: 'REQUEST_EXPIRED' })
    }
    if (request.maxFiles && request._count.receivedFiles >= request.maxFiles) {
      return reply.code(429).send({ code: 'REQUEST_LIMIT_REACHED' })
    }

    // Vérification anticipée du mot de passe via header (avant toute écriture sur disque)
    if (request.password) {
      const rawHeader = (req.headers['x-upload-password'] as string) ?? ''
      let provided = ''
      try { provided = Buffer.from(rawHeader, 'base64').toString('utf8') } catch { provided = rawHeader }
      const ok = await bcrypt.compare(provided, request.password)
      if (!ok) return reply.code(401).send({ code: 'WRONG_PASSWORD' })
    }

    const parts = req.parts()
    const savedFiles: any[] = []
    let uploaderName: string | undefined
    let uploaderEmail: string | undefined
    let message: string | undefined

    const appSettings = await getAppSettings()
    const globalMaxBytes = appSettings.maxFileSizeBytes ?? null

    for await (const part of parts) {
      if (part.type === 'field') {
        if (part.fieldname === 'uploaderName') uploaderName = part.value as string
        if (part.fieldname === 'uploaderEmail') uploaderEmail = part.value as string
        if (part.fieldname === 'message') message = part.value as string
      } else {
        // Vérifier le quota restant en tenant compte des fichiers déjà sauvés dans cette requête
        if (request.maxFiles) {
          const total = request._count.receivedFiles + savedFiles.length
          if (total >= request.maxFiles) {
            await Promise.all(savedFiles.map((f: any) => fs.remove(f.path).catch(() => {})))
            return reply.code(429).send({ code: 'REQUEST_LIMIT_REACHED' })
          }
        }
        const ext = path.extname(part.filename || '') || ''
        const filename = `recv_${nanoid(12)}${ext}`
        const destDir = path.join(UPLOAD_DIR, 'received', request.id)
        await fs.ensureDir(destDir)
        const filePath = path.join(destDir, filename)

        const writeStream = fs.createWriteStream(filePath)
        let size = 0n
        const perRequestMax = request.maxSizeBytes ?? null
        const maxBytes = perRequestMax !== null && globalMaxBytes !== null
          ? (perRequestMax < globalMaxBytes ? perRequestMax : globalMaxBytes)
          : (perRequestMax ?? globalMaxBytes)

        try {
          for await (const chunk of part.file) {
            size += BigInt(chunk.length)
            if (maxBytes !== null && size > maxBytes) {
              writeStream.destroy()
              await fs.remove(filePath).catch(() => {})
              await Promise.all(savedFiles.map((f: any) => fs.remove(f.path).catch(() => {})))
              return reply.code(413).send({ code: 'FILE_TOO_LARGE' })
            }
            if (!writeStream.write(chunk)) {
              await new Promise<void>((resolve, reject) => {
                const onDrain = () => { writeStream.off('error', onError); resolve() }
                const onError = (err: Error) => { writeStream.off('drain', onDrain); reject(err) }
                writeStream.once('drain', onDrain)
                writeStream.once('error', onError)
              })
            }
          }
          await new Promise<void>((resolve, reject) => {
            const onFinish = () => { writeStream.off('error', onError); resolve() }
            const onError = (err: Error) => { writeStream.off('finish', onFinish); reject(err) }
            writeStream.once('finish', onFinish)
            writeStream.once('error', onError)
            writeStream.end()
          })
        } catch (err) {
          writeStream.destroy()
          await fs.remove(filePath).catch(() => {})
          throw err
        }

        savedFiles.push({
          uploadRequestId: request.id,
          filename,
          originalName: part.filename || 'file',
          mimeType: mime.lookup(part.filename || '') || 'application/octet-stream',
          size: size,
          path: filePath,
          uploaderName: uploaderName || null,
          uploaderEmail: uploaderEmail || null,
          message: message || null
        })
      }
    }

    const created = await Promise.all(
      savedFiles.map((f: any) => prisma.receivedFile.create({ data: f }))
    )
    req.log.info({ token: req.params.token, count: created.length, uploaderName }, 'Files received via upload request')
    return reply.code(201).send(
      created.map((f: any) => ({
        id: f.id,
        originalName: f.originalName,
        size: f.size.toString()
      }))
    )
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

  // GET /api/upload-requests/:id/received/:fileId/download
  app.get<{ Params: { id: string; fileId: string } }>(
    '/:id/received/:fileId/download',
    auth,
    async (req, reply) => {
      const where = ownerWhere(req, req.params.id)
      const request = await prisma.uploadRequest.findFirst({ where })
      if (!request) return reply.code(403).send({ code: 'FORBIDDEN' })

      const file = await prisma.receivedFile.findFirst({
        where: { id: req.params.fileId, uploadRequestId: req.params.id }
      })
      if (!file) return reply.code(404).send({ code: 'FILE_NOT_FOUND' })

      const fileExists = await fs.pathExists(file.path)
      if (!fileExists) return reply.code(404).send({ code: 'FILE_MISSING' })

      req.log.debug({ id: req.params.id, fileId: req.params.fileId, userId: req.user.id }, 'Received file downloaded')
      const stream = fs.createReadStream(file.path)
      reply.header('Content-Type', file.mimeType)
      reply.header(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(file.originalName)}"`
      )
      reply.header('Content-Length', file.size.toString())
      return reply.send(stream)
    }
  )

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
          to: settings.smtpFrom,
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
}
