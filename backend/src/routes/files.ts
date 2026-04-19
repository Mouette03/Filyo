import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import path from 'path'
import fs from 'fs-extra'
import { nanoid } from 'nanoid'
import mime from 'mime-types'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { UPLOAD_DIR } from '../lib/config'
import { getAppSettings } from '../lib/appSettings'
import { createFilesTusServer, getTusFileResult } from '../lib/tus'

async function getUsedBytes(userId: string): Promise<bigint> {
  const [filesAgg, receivedAgg] = await Promise.all([
    prisma.file.aggregate({ _sum: { size: true }, where: { userId } }),
    prisma.receivedFile.aggregate({ _sum: { size: true }, where: { uploadRequest: { userId } } })
  ])
  return (filesAgg._sum.size ?? BigInt(0)) + (receivedAgg._sum.size ?? BigInt(0))
}

export async function fileRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }
  const tusServer = createFilesTusServer(app)

  // POST /api/files - Upload (authentifié)
  app.post('/', auth, async (req, reply) => {
    const userId: string = req.user.id
    const appSettings = await getAppSettings()
    const globalMaxBytes = appSettings.maxFileSizeBytes ?? null
    const contentLength = req.headers['content-length'] ? BigInt(req.headers['content-length']) : null

    // Rejet anticipé via Content-Length vs limite globale par fichier
    if (globalMaxBytes !== null && contentLength !== null && contentLength > globalMaxBytes) {
      return reply.code(413).send({ code: 'FILE_TOO_LARGE', maxBytes: globalMaxBytes.toString() })
    }

    // Vérification quota utilisateur
    const userRecord = await prisma.user.findUnique({ where: { id: userId }, select: { storageQuotaBytes: true } })
    const quotaBytes = userRecord?.storageQuotaBytes ?? null
    let usedBytes = BigInt(0)
    if (quotaBytes !== null) {
      usedBytes = await getUsedBytes(userId)
      if (usedBytes >= quotaBytes) {
        return reply.code(413).send({ code: 'QUOTA_EXCEEDED' })
      }
      if (contentLength !== null && usedBytes + contentLength > quotaBytes) {
        return reply.code(413).send({ code: 'QUOTA_EXCEEDED' })
      }
    }

    const parts = req.parts()
    const uploadedFiles: any[] = []
    let expiresIn: string | undefined
    let maxDownloads: string | undefined
    let rawPassword: string | undefined
    let hideFilenames = false

    for await (const part of parts) {
      if (part.type === 'field') {
        if (part.fieldname === 'expiresIn') expiresIn = part.value as string
        if (part.fieldname === 'maxDownloads') maxDownloads = part.value as string
        if (part.fieldname === 'password') rawPassword = part.value as string
        if (part.fieldname === 'hideFilenames') hideFilenames = part.value === 'true'
      } else {
        const ext = path.extname(part.filename || '') || ''
        const filename = `${nanoid(12)}${ext}`
        const filePath = path.join(UPLOAD_DIR, filename)
        await fs.ensureDir(UPLOAD_DIR)

        let size = 0
        const writeStream = fs.createWriteStream(filePath)
        writeStream.on('error', () => {})
        try {
          for await (const chunk of part.file) {
            size += chunk.length
            if (globalMaxBytes !== null && BigInt(size) > globalMaxBytes) {
              writeStream.destroy()
              await fs.remove(filePath).catch(() => {})
              await Promise.all(uploadedFiles.map((f: any) => fs.remove(f.path).catch(() => {})))
              return reply.code(413).send({ code: 'FILE_TOO_LARGE', maxBytes: globalMaxBytes.toString() })
            }
            if (quotaBytes !== null) {
              const uploadedSize = uploadedFiles.reduce((acc: bigint, f: any) => acc + f.size, BigInt(0))
              if (usedBytes + uploadedSize + BigInt(size) > quotaBytes) {
                writeStream.destroy()
                await fs.remove(filePath).catch(() => {})
                await Promise.all(uploadedFiles.map((f: any) => fs.remove(f.path).catch(() => {})))
                return reply.code(413).send({ code: 'QUOTA_EXCEEDED' })
              }
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

        uploadedFiles.push({
          filename,
          originalName: part.filename || 'file',
          mimeType: mime.lookup(part.filename || '') || 'application/octet-stream',
          size: BigInt(size),
          path: filePath
        })
      }
    }

    const expiresAt = expiresIn
      ? new Date(Date.now() + parseInt(expiresIn, 10) * 1000)
      : null

    const hashedPassword = rawPassword ? await bcrypt.hash(rawPassword, 10) : null

    // Lot : batchToken uniquement si plusieurs fichiers
    const batchToken = uploadedFiles.length > 1 ? nanoid(16) : null

    const files = await Promise.all(
      uploadedFiles.map(f =>
        prisma.file.create({
          data: {
            ...f,
            userId,
            expiresAt,
            maxDownloads: maxDownloads ? parseInt(maxDownloads, 10) : null,
            password: hashedPassword,
            batchToken,
            hideFilenames,
            shares: {
              create: {
                token: nanoid(16),
                expiresAt,
                maxDownloads: maxDownloads ? parseInt(maxDownloads, 10) : null,
                password: hashedPassword
              }
            }
          },
          include: { shares: true }
        })
      )
    )

    req.log.info({ userId, count: files.length }, 'Files uploaded')
    return reply.code(201).send(
      files.map((f: any) => ({
        id: f.id,
        originalName: f.originalName,
        mimeType: f.mimeType,
        size: f.size.toString(),
        expiresAt: f.expiresAt,
        shareToken: f.shares[0]?.token,
        batchToken: f.batchToken
      }))
    )
  })

  // ── Routes TUS (upload resumable) ────────────────────────────────────────────
  // Toutes les requêtes TUS sont déléguées au serveur TUS via reply.hijack()
  // Le serveur TUS gère : POST (init), PATCH (chunk), HEAD (status), DELETE (abort), OPTIONS (CORS)
  const handleTus = async (req: FastifyRequest, reply: FastifyReply) => {
    reply.hijack()
    await new Promise<void>((resolve) => {
      tusServer.handle(req.raw, reply.raw)
      reply.raw.once('finish', resolve)
      reply.raw.once('close', resolve)
    })
  }
  app.all('/tus', { config: { rateLimit: { max: 10, timeWindow: '1 minute', keyGenerator: (req) => req.ip } } }, handleTus)
  app.all('/tus/*', { config: { rateLimit: { max: 200, timeWindow: '1 minute', keyGenerator: (req) => req.ip } } }, handleTus)

  // GET /api/files/tus-result/:uploadId — Récupère le résultat d'un upload TUS terminé
  // Appelé par le client après onSuccess de tus-js-client
  app.get<{ Params: { uploadId: string } }>('/tus-result/:uploadId', auth, async (req, reply) => {
    // Tentative 1 : map en mémoire (cas nominal)
    const result = getTusFileResult(req.params.uploadId)
    if (result) return result

    // Tentative 2 : fallback DB (redémarrage entre PATCH et GET)
    const file = await prisma.file.findUnique({
      where: { tusUploadId: req.params.uploadId },
      include: { shares: true }
    })
    if (!file) return reply.code(404).send({ code: 'RESULT_NOT_FOUND' })
    return {
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size.toString(),
      expiresAt: file.expiresAt?.toISOString() ?? null,
      shareToken: file.shares[0]?.token ?? '',
      batchToken: file.batchToken
    }
  })

  // GET /api/files - Fichiers de l utilisateur courant
  app.get('/', auth, async (req) => {
    const files = await prisma.file.findMany({
      where: { userId: req.user.id },
      orderBy: { uploadedAt: 'desc' },
      include: { shares: true }
    })
    req.log.debug({ userId: req.user.id, count: files.length }, 'File list')
    return files.map((f: any) => ({ ...f, size: f.size.toString() }))
  })

  // GET /api/files/:id - Infos d un fichier (proprietaire uniquement)
  app.get<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const file = await prisma.file.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { shares: true }
    })
    if (!file) return reply.code(404).send({ code: 'FILE_NOT_FOUND' })
    return { ...file, size: file.size.toString() }
  })

  // DELETE /api/files/:id (proprietaire ou admin)
  app.delete<{ Params: { id: string } }>('/:id', auth, async (req, reply) => {
    const where =
      req.user.role === 'ADMIN'
        ? { id: req.params.id }
        : { id: req.params.id, userId: req.user.id }
    const file = await prisma.file.findFirst({ where })
    if (!file) return reply.code(404).send({ code: 'FILE_NOT_FOUND' })
    await fs.remove(file.path).catch(() => {})
    await prisma.file.delete({ where: { id: req.params.id } })
    req.log.info({ fileId: req.params.id, userId: req.user.id }, 'File deleted')
    return { success: true }
  })

  // PATCH /api/files/:id/expiry - Modifier l'expiration (propriétaire uniquement)
  app.patch<{ Params: { id: string }; Body: { expiresAt: string | null } }>(
    '/:id/expiry',
    auth,
    async (req, reply) => {
      const file = await prisma.file.findFirst({
        where: { id: req.params.id, userId: req.user.id }
      })
      if (!file) return reply.code(404).send({ code: 'FILE_NOT_FOUND' })
      let expiresAt: Date | null = null
      if (req.body.expiresAt) {
        expiresAt = new Date(req.body.expiresAt)
        if (isNaN(expiresAt.getTime())) return reply.code(400).send({ code: 'INVALID_DATE' })
      }
      await prisma.file.update({ where: { id: req.params.id }, data: { expiresAt } })
      await prisma.share.updateMany({ where: { fileId: req.params.id }, data: { expiresAt } })
      return { expiresAt }
    }
  )

  // PATCH /api/files/:id/max-downloads - Modifier la limite de téléchargements
  app.patch<{ Params: { id: string }; Body: { maxDownloads: number | null } }>(
    '/:id/max-downloads',
    auth,
    async (req, reply) => {
      const file = await prisma.file.findFirst({
        where: { id: req.params.id, userId: req.user.id }
      })
      if (!file) return reply.code(404).send({ code: 'FILE_NOT_FOUND' })
      const { maxDownloads } = req.body
      if (maxDownloads !== null && (!Number.isInteger(maxDownloads) || maxDownloads < 1)) {
        return reply.code(400).send({ code: 'INVALID_MAX_DOWNLOADS' })
      }
      await prisma.file.update({ where: { id: req.params.id }, data: { maxDownloads: maxDownloads ?? null } })
      await prisma.share.updateMany({ where: { fileId: req.params.id }, data: { maxDownloads: maxDownloads ?? null } })
      return { maxDownloads }
    }
  )
}
