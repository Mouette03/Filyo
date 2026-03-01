import { FastifyInstance } from 'fastify'
import path from 'path'
import fs from 'fs-extra'
import { nanoid } from 'nanoid'
import mime from 'mime-types'
import bcrypt from 'bcrypt'
import { prisma } from '../lib/prisma'

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/data/uploads'

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
      return reply.code(404).send({ error: 'Lien invalide ou desactive' })
    }
    if (request.expiresAt && request.expiresAt < new Date()) {
      return reply.code(410).send({ error: 'Ce lien de depot a expire' })
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
      return reply.code(404).send({ error: 'Lien invalide ou desactive' })
    }
    if (request.expiresAt && request.expiresAt < new Date()) {
      return reply.code(410).send({ error: 'Lien expire' })
    }
    if (request.maxFiles && request._count.receivedFiles >= request.maxFiles) {
      return reply.code(429).send({ error: 'Limite de fichiers atteinte' })
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

        let size = 0
        const writeStream = fs.createWriteStream(filePath)
        for await (const chunk of part.file) {
          writeStream.write(chunk)
          size += chunk.length
        }
        writeStream.end()

        if (request.maxSizeBytes && BigInt(size) > request.maxSizeBytes) {
          await fs.remove(filePath)
          return reply.code(413).send({ error: 'Fichier trop volumineux' })
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
        return reply.code(401).send({ error: 'Mot de passe incorrect' })
      }
    }

    const created = await Promise.all(
      savedFiles.map((f: any) => prisma.receivedFile.create({ data: f }))
    )
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
    if (!request) return reply.code(403).send({ error: 'Non autorise' })

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
      if (!request) return reply.code(403).send({ error: 'Non autorise' })

      const file = await prisma.receivedFile.findFirst({
        where: { id: req.params.fileId, uploadRequestId: req.params.id }
      })
      if (!file) return reply.code(404).send({ error: 'Fichier introuvable' })

      const fileExists = await fs.pathExists(file.path)
      if (!fileExists) return reply.code(404).send({ error: 'Fichier manquant sur le serveur' })

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
    if (!request) return reply.code(403).send({ error: 'Non autorise' })
    const updated = await prisma.uploadRequest.update({
      where: { id: req.params.id },
      data: { active: !request.active }
    })
    return { active: updated.active }
  })

  // DELETE /api/upload-requests/:id (proprietaire ou admin)
  app.delete<{ Params: { id: string } }>('/:id', auth, async (req: any, reply) => {
    const where =
      req.user.role === 'ADMIN'
        ? { id: req.params.id }
        : { id: req.params.id, userId: req.user.id }
    const request = await prisma.uploadRequest.findFirst({ where })
    if (!request) return reply.code(403).send({ error: 'Non autorise' })

    const files = await prisma.receivedFile.findMany({ where: { uploadRequestId: request.id } })
    for (const f of files) {
      await fs.remove(f.path).catch(() => {})
    }
    await prisma.uploadRequest.delete({ where: { id: req.params.id } })
    return { success: true }
  })
}
