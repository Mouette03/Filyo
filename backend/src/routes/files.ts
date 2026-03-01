import { FastifyInstance } from 'fastify'
import path from 'path'
import fs from 'fs-extra'
import { nanoid } from 'nanoid'
import mime from 'mime-types'
import bcrypt from 'bcrypt'
import { prisma } from '../lib/prisma'

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/data/uploads'

export async function fileRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }

  // POST /api/files - Upload (authentifié)
  app.post('/', auth, async (req: any, reply) => {
    const userId: string = req.user.id
    const parts = req.parts()
    const uploadedFiles: any[] = []
    let expiresIn: string | undefined
    let maxDownloads: string | undefined
    let rawPassword: string | undefined

    for await (const part of parts) {
      if (part.type === 'field') {
        if (part.fieldname === 'expiresIn') expiresIn = part.value as string
        if (part.fieldname === 'maxDownloads') maxDownloads = part.value as string
        if (part.fieldname === 'password') rawPassword = part.value as string
      } else {
        const ext = path.extname(part.filename || '') || ''
        const filename = `${nanoid(12)}${ext}`
        const filePath = path.join(UPLOAD_DIR, filename)
        await fs.ensureDir(UPLOAD_DIR)

        let size = 0
        const writeStream = fs.createWriteStream(filePath)
        for await (const chunk of part.file) {
          writeStream.write(chunk)
          size += chunk.length
        }
        writeStream.end()

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

    const files = await Promise.all(
      uploadedFiles.map(f =>
        prisma.file.create({
          data: {
            ...f,
            userId,
            expiresAt,
            maxDownloads: maxDownloads ? parseInt(maxDownloads) : null,
            password: hashedPassword,
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

    return reply.code(201).send(
      files.map((f: any) => ({
        id: f.id,
        originalName: f.originalName,
        mimeType: f.mimeType,
        size: f.size.toString(),
        expiresAt: f.expiresAt,
        shareToken: f.shares[0]?.token
      }))
    )
  })

  // GET /api/files - Fichiers de l utilisateur courant
  app.get('/', auth, async (req: any) => {
    const files = await prisma.file.findMany({
      where: { userId: req.user.id },
      orderBy: { uploadedAt: 'desc' },
      include: { shares: true }
    })
    return files.map((f: any) => ({ ...f, size: f.size.toString() }))
  })

  // GET /api/files/:id - Infos d un fichier (proprietaire uniquement)
  app.get<{ Params: { id: string } }>('/:id', auth, async (req: any, reply) => {
    const file = await prisma.file.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { shares: true }
    })
    if (!file) return reply.code(404).send({ error: 'Fichier introuvable' })
    return { ...file, size: file.size.toString() }
  })

  // DELETE /api/files/:id (proprietaire ou admin)
  app.delete<{ Params: { id: string } }>('/:id', auth, async (req: any, reply) => {
    const where =
      req.user.role === 'ADMIN'
        ? { id: req.params.id }
        : { id: req.params.id, userId: req.user.id }
    const file = await prisma.file.findFirst({ where })
    if (!file) return reply.code(404).send({ error: 'Fichier introuvable ou non autorise' })
    await fs.remove(file.path).catch(() => {})
    await prisma.file.delete({ where: { id: req.params.id } })
    return { success: true }
  })
}
