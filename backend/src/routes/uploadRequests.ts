import { FastifyInstance } from 'fastify'
import path from 'path'
import fs from 'fs-extra'
import { nanoid } from 'nanoid'
import mime from 'mime-types'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { UPLOAD_DIR } from '../lib/config'
import { getAppSettings } from '../lib/appSettings'
import { createSmtpTransport } from '../lib/smtp'

export async function uploadRequestRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }

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
  }>('/', auth, async (req: any, reply) => {
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
  app.get('/', auth, async (req: any) => {
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
  app.post<{ Params: { token: string } }>('/:token/upload', async (req, reply) => {
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

    const parts = req.parts()
    const savedFiles: any[] = []
    let uploaderName: string | undefined
    let uploaderEmail: string | undefined
    let message: string | undefined
    let rawPassword: string | undefined

    for await (const part of parts) {
      if (part.type === 'field') {
        if (part.fieldname === 'uploaderName') uploaderName = part.value as string
        if (part.fieldname === 'uploaderEmail') uploaderEmail = part.value as string
        if (part.fieldname === 'message') message = part.value as string
        if (part.fieldname === 'password') rawPassword = part.value as string
      } else {
        const ext = path.extname(part.filename || '') || ''
        const filename = `recv_${nanoid(12)}${ext}`
        const destDir = path.join(UPLOAD_DIR, 'received', request.id)
        await fs.ensureDir(destDir)
        const filePath = path.join(destDir, filename)

        const writeStream = fs.createWriteStream(filePath)
        let size = 0
        const maxBytes = request.maxSizeBytes ? Number(request.maxSizeBytes) : null

        try {
          for await (const chunk of part.file) {
            size += chunk.length
            if (maxBytes && size > maxBytes) {
              writeStream.destroy()
              await fs.remove(filePath).catch(() => {})
              return reply.code(413).send({ code: 'FILE_TOO_LARGE' })
            }
            if (!writeStream.write(chunk)) {
              await new Promise<void>(r => writeStream.once('drain', r))
            }
          }
          await new Promise<void>((resolve, reject) => {
            writeStream.end()
            writeStream.once('finish', resolve)
            writeStream.once('error', reject)
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
          size: BigInt(size),
          path: filePath,
          uploaderName: uploaderName || null,
          uploaderEmail: uploaderEmail || null,
          message: message || null
        })
      }
    }

    // Vérifier le mot de passe APRÈS la boucle pour s'assurer que le champ a bien été lu
    if (request.password) {
      const ok = await bcrypt.compare(rawPassword || '', request.password)
      if (!ok) {
        // Supprimer les fichiers temporaires déjà écrits
        await Promise.all(savedFiles.map((f: any) => fs.remove(f.path).catch(() => {})))
        return reply.code(401).send({ code: 'WRONG_PASSWORD' })
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
  app.get<{ Params: { id: string } }>('/:id/files', auth, async (req: any, reply) => {
    const where =
      req.user.role === 'ADMIN'
        ? { id: req.params.id }
        : { id: req.params.id, userId: req.user.id }
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
    async (req: any, reply) => {
      const where =
        req.user.role === 'ADMIN'
          ? { id: req.params.id }
          : { id: req.params.id, userId: req.user.id }
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
  app.patch<{ Params: { id: string } }>('/:id/toggle', auth, async (req: any, reply) => {
    const where =
      req.user.role === 'ADMIN'
        ? { id: req.params.id }
        : { id: req.params.id, userId: req.user.id }
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
    auth,
    async (req: any, reply) => {
      const { to, lang = 'fr' } = req.body
      const isEn = lang === 'en'
      const addresses: string[] = (to || '').split(',').map((s: string) => s.trim()).filter(Boolean)
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (addresses.length === 0 || addresses.some(a => !emailRegex.test(a))) {
        return reply.code(400).send({ code: 'EMAIL_INVALID' })
      }
      const toField = addresses.join(', ')
      const where =
        req.user.role === 'ADMIN'
          ? { id: req.params.id }
          : { id: req.params.id, userId: req.user.id }
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
      const subject = isEn
        ? `[${appName}] File deposit request: ${request.title}`
        : `[${appName}] Demande de dépôt : ${request.title}`
      const bodyText = isEn
        ? `Hello,\n\nYou have been invited to deposit files: "${request.title}".\n\n${request.message ? request.message + '\n\n' : ''}Deposit link:\n${depositUrl}\n\nSent via ${appName}.`
        : `Bonjour,\n\nVous êtes invité(e) à déposer des fichiers : "${request.title}".\n\n${request.message ? request.message + '\n\n' : ''}Lien de dépôt :\n${depositUrl}\n\nEnvoyé via ${appName}.`
      try {
        await transporter.sendMail({
          from: `"${appName}" <${settings.smtpFrom}>`,
          to: toField,
          subject,
          text: bodyText,
          html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;background:#0d0e1a;color:#e8eaf6;padding:32px 24px;border-radius:16px">
          <h2 style="margin:0 0 6px;color:#7a8dff;font-size:20px">${appName}</h2>
          <p style="color:#aaa;font-size:13px;margin:0 0 24px">${isEn ? 'File deposit request' : 'Demande de dépôt de fichiers'}</p>
          <p style="margin:0 0 8px">${isEn ? 'You have been invited to deposit files:' : 'Vous êtes invité(e) à déposer des fichiers :'} <strong>${request.title}</strong></p>
          ${request.message ? `<p style="margin:0 0 16px;color:#ccc;font-style:italic">"${request.message}"</p>` : ''}
          <a href="${depositUrl}" style="display:inline-block;background:#5c6bfa;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px">${isEn ? 'Deposit files' : 'Déposer des fichiers'}</a>
          <p style="margin:12px 0 0;font-size:12px;color:#666;font-family:monospace">${depositUrl}</p>
          <p style="margin:24px 0 0;font-size:11px;color:#444">${appName}</p>
        </div>`
        })
      } catch (err: any) {
        req.log.error({ err: err.message }, 'Upload request email failed')
        return reply.code(502).send({ code: 'EMAIL_SEND_FAILED', detail: err.message })
      }
      req.log.info({ id: req.params.id, to: toField }, 'Upload request email sent')
      return { success: true }
    }
  )

  // DELETE /api/upload-requests/:id (proprietaire ou admin)
  app.delete<{ Params: { id: string } }>('/:id', auth, async (req: any, reply) => {
    const where =
      req.user.role === 'ADMIN'
        ? { id: req.params.id }
        : { id: req.params.id, userId: req.user.id }
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
