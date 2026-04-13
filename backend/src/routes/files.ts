import { FastifyInstance } from 'fastify'
import path from 'path'
import fs from 'fs-extra'
import { nanoid } from 'nanoid'
import mime from 'mime-types'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { UPLOAD_DIR } from '../lib/config'
import { getAppSettings } from '../lib/appSettings'

export async function fileRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }

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
      const [filesAgg, receivedAgg] = await Promise.all([
        prisma.file.aggregate({ _sum: { size: true }, where: { userId } }),
        prisma.receivedFile.aggregate({ _sum: { size: true }, where: { uploadRequest: { userId } } })
      ])
      usedBytes = (filesAgg._sum.size ?? BigInt(0)) + (receivedAgg._sum.size ?? BigInt(0))
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
      ? new Date(Date.now() + parseInt(expiresIn) * 1000)
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
            maxDownloads: maxDownloads ? parseInt(maxDownloads) : null,
            password: hashedPassword,
            batchToken,
            hideFilenames,
            shares: {
              create: {
                token: nanoid(16),
                expiresAt,
                maxDownloads: maxDownloads ? parseInt(maxDownloads) : null,
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

  // POST /api/files/upload-init — Initialise un upload chunked (authentifié)
  app.post<{
    Body: {
      filename: string; mimeType: string; totalSize: number; totalChunks: number
      expiresIn?: string; maxDownloads?: string; password?: string
      hideFilenames?: boolean; batchToken?: string
    }
  }>('/upload-init', auth, async (req, reply) => {
    const userId = req.user.id
    const { filename, mimeType, totalSize, totalChunks, expiresIn, maxDownloads, password: rawPassword, hideFilenames, batchToken } = req.body

    const appSettings = await getAppSettings()
    const globalMaxBytes = appSettings.maxFileSizeBytes ?? null
    if (globalMaxBytes !== null && BigInt(totalSize) > globalMaxBytes) {
      return reply.code(413).send({ code: 'FILE_TOO_LARGE', maxBytes: globalMaxBytes.toString() })
    }

    const userRecord = await prisma.user.findUnique({ where: { id: userId }, select: { storageQuotaBytes: true } })
    const quotaBytes = userRecord?.storageQuotaBytes ?? null
    if (quotaBytes !== null) {
      const [filesAgg, receivedAgg] = await Promise.all([
        prisma.file.aggregate({ _sum: { size: true }, where: { userId } }),
        prisma.receivedFile.aggregate({ _sum: { size: true }, where: { uploadRequest: { userId } } })
      ])
      const usedBytes = (filesAgg._sum.size ?? BigInt(0)) + (receivedAgg._sum.size ?? BigInt(0))
      if (usedBytes + BigInt(totalSize) > quotaBytes) {
        return reply.code(413).send({ code: 'QUOTA_EXCEEDED' })
      }
    }

    const hashedPassword = rawPassword ? await bcrypt.hash(rawPassword, 10) : null

    const chunked = await prisma.fileChunkedUpload.create({
      data: {
        userId,
        originalName: filename,
        mimeType: mimeType || 'application/octet-stream',
        totalSize: BigInt(totalSize),
        totalChunks,
        expiresIn: expiresIn ? parseInt(expiresIn) : null,
        maxDownloads: maxDownloads ? parseInt(maxDownloads) : null,
        password: hashedPassword,
        hideFilenames: hideFilenames || false,
        batchToken: batchToken || null
      }
    })

    const chunksDir = path.join(UPLOAD_DIR, 'chunks', chunked.id)
    await fs.ensureDir(chunksDir)

    req.log.info({ uploadId: chunked.id, filename, totalChunks }, 'File chunked upload initialized')
    return reply.code(201).send({ uploadId: chunked.id, receivedChunks: 0 })
  })

  // GET /api/files/upload-status/:uploadId — Statut d'un upload chunked (authentifié)
  app.get<{ Params: { uploadId: string } }>('/upload-status/:uploadId', auth, async (req, reply) => {
    const chunked = await prisma.fileChunkedUpload.findFirst({
      where: { id: req.params.uploadId, userId: req.user.id }
    })
    if (!chunked) return reply.code(404).send({ code: 'UPLOAD_NOT_FOUND' })
    return { uploadId: chunked.id, receivedChunks: chunked.receivedChunks, totalChunks: chunked.totalChunks }
  })

  // POST /api/files/upload-chunk — Reçoit un chunk (authentifié)
  app.post<{ Params: Record<string, never> }>('/upload-chunk', auth, async (req, reply) => {
    let uploadId: string | undefined
    let chunkIndex: number | undefined
    let chunkSaved = false

    const parts = req.parts()
    for await (const part of parts) {
      if (part.type === 'field') {
        if (part.fieldname === 'uploadId') uploadId = part.value as string
        if (part.fieldname === 'chunkIndex') chunkIndex = parseInt(part.value as string, 10)
      } else if (part.type === 'file' && part.fieldname === 'chunk') {
        if (uploadId === undefined || chunkIndex === undefined) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _ of part.file) { /* drain */ }
          return reply.code(400).send({ code: 'MISSING_FIELDS' })
        }

        const chunked = await prisma.fileChunkedUpload.findFirst({
          where: { id: uploadId, userId: req.user.id }
        })
        if (!chunked) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _ of part.file) { /* drain */ }
          return reply.code(404).send({ code: 'UPLOAD_NOT_FOUND' })
        }

        if (chunkIndex < 0 || chunkIndex >= chunked.totalChunks) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _ of part.file) { /* drain */ }
          return reply.code(400).send({ code: 'INVALID_CHUNK_INDEX' })
        }

        const chunksDir = path.join(UPLOAD_DIR, 'chunks', chunked.id)
        const chunkPath = path.join(chunksDir, `chunk_${chunkIndex}`)
        await fs.ensureDir(chunksDir)
        // Ouverture exclusive (flag 'wx') : atomique — élimine la race condition
        // si deux requêtes arrivent simultanément pour le même chunk
        const writeStream = fs.createWriteStream(chunkPath, { flags: 'wx' })
        const openError = await new Promise<(Error & { code?: string }) | null>(resolve => {
          writeStream.once('open', () => resolve(null))
          writeStream.once('error', (err: Error & { code?: string }) => resolve(err))
        })
        if (openError) {
          writeStream.destroy()
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _ of part.file) { /* drain */ }
          if (openError.code === 'EEXIST') { chunkSaved = true; continue }
          throw openError
        }
        writeStream.on('error', () => {})
        try {
          for await (const data of part.file) {
            if (!writeStream.write(data)) {
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
          await fs.remove(chunkPath).catch(() => {})
          throw err
        }

        await prisma.fileChunkedUpload.update({
          where: { id: chunked.id },
          data: { receivedChunks: { increment: 1 }, lastChunkAt: new Date() }
        })
        chunkSaved = true
      }
    }

    if (!chunkSaved) return reply.code(400).send({ code: 'NO_CHUNK_DATA' })
    const updated = await prisma.fileChunkedUpload.findUnique({ where: { id: uploadId! } })
    return { receivedChunks: updated?.receivedChunks ?? 0, totalChunks: updated?.totalChunks ?? 0 }
  })

  // POST /api/files/upload-finalize — Fusionne les chunks, crée File + Share (authentifié)
  app.post<{ Body: { uploadId: string } }>('/upload-finalize', auth, async (req, reply) => {
    const { uploadId } = req.body
    const userId = req.user.id

    const chunked = await prisma.fileChunkedUpload.findFirst({
      where: { id: uploadId, userId }
    })
    if (!chunked) return reply.code(404).send({ code: 'UPLOAD_NOT_FOUND' })
    if (chunked.receivedChunks < chunked.totalChunks) {
      return reply.code(400).send({ code: 'INCOMPLETE_UPLOAD', receivedChunks: chunked.receivedChunks, totalChunks: chunked.totalChunks })
    }

    const appSettings = await getAppSettings()
    const globalMaxBytes = appSettings.maxFileSizeBytes ?? null
    if (globalMaxBytes !== null && chunked.totalSize > globalMaxBytes) {
      await fs.remove(path.join(UPLOAD_DIR, 'chunks', chunked.id)).catch(() => {})
      await prisma.fileChunkedUpload.delete({ where: { id: chunked.id } })
      return reply.code(413).send({ code: 'FILE_TOO_LARGE' })
    }

    const ext = path.extname(chunked.originalName) || ''
    const filename = `${nanoid(12)}${ext}`
    const filePath = path.join(UPLOAD_DIR, filename)
    await fs.ensureDir(UPLOAD_DIR)
    const chunksDir = path.join(UPLOAD_DIR, 'chunks', chunked.id)

    const writeStream = fs.createWriteStream(filePath)
    writeStream.on('error', () => {})
    try {
      for (let i = 0; i < chunked.totalChunks; i++) {
        const chunkPath = path.join(chunksDir, `chunk_${i}`)
        if (!(await fs.pathExists(chunkPath))) {
          writeStream.destroy()
          await fs.remove(filePath).catch(() => {})
          return reply.code(400).send({ code: 'CHUNK_MISSING', chunkIndex: i })
        }
        const data = await fs.readFile(chunkPath)
        if (!writeStream.write(data)) {
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

    const expiresAt = chunked.expiresIn ? new Date(Date.now() + chunked.expiresIn * 1000) : null

    const file = await prisma.file.create({
      data: {
        filename,
        originalName: chunked.originalName,
        mimeType: chunked.mimeType,
        size: chunked.totalSize,
        path: filePath,
        userId,
        expiresAt,
        maxDownloads: chunked.maxDownloads,
        password: chunked.password,
        batchToken: chunked.batchToken,
        hideFilenames: chunked.hideFilenames,
        shares: {
          create: {
            token: nanoid(16),
            expiresAt,
            maxDownloads: chunked.maxDownloads,
            password: chunked.password
          }
        }
      },
      include: { shares: true }
    })

    await fs.remove(chunksDir).catch(() => {})
    await prisma.fileChunkedUpload.delete({ where: { id: chunked.id } })

    req.log.info({ uploadId, filename, size: chunked.totalSize.toString() }, 'File chunked upload finalized')
    return reply.code(201).send({
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size.toString(),
      expiresAt: file.expiresAt,
      shareToken: file.shares[0]?.token,
      batchToken: file.batchToken
    })
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
}
