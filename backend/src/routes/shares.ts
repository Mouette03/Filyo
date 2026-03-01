import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import fs from 'fs-extra'
import { prisma } from '../lib/prisma'

export async function shareRoutes(app: FastifyInstance) {
  // GET /api/shares/:token/info - Info publique (sans téléchargement)
  app.get<{ Params: { token: string } }>('/:token/info', async (req, reply) => {
    const share = await prisma.share.findUnique({
      where: { token: req.params.token },
      include: { file: true }
    })
    if (!share) return reply.code(404).send({ error: 'Lien invalide' })

    if (share.expiresAt && share.expiresAt < new Date()) {
      return reply.code(410).send({ error: 'Ce lien a expiré' })
    }
    if (share.maxDownloads && share.downloads >= share.maxDownloads) {
      return reply.code(410).send({ error: 'Limite de téléchargements atteinte' })
    }

    return {
      token: share.token,
      label: share.label,
      filename: share.file.originalName,
      mimeType: share.file.mimeType,
      size: share.file.size.toString(),
      expiresAt: share.expiresAt,
      hasPassword: !!share.password,
      downloads: share.downloads,
      maxDownloads: share.maxDownloads
    }
  })

  // POST /api/shares/:token/download - Télécharger (avec vérif password si besoin)
  app.post<{
    Params: { token: string }
    Body: { password?: string }
  }>('/:token/download', async (req, reply) => {
    const share = await prisma.share.findUnique({
      where: { token: req.params.token },
      include: { file: true }
    })
    if (!share) return reply.code(404).send({ error: 'Lien invalide' })

    if (share.expiresAt && share.expiresAt < new Date()) {
      return reply.code(410).send({ error: 'Ce lien a expiré' })
    }
    if (share.maxDownloads && share.downloads >= share.maxDownloads) {
      return reply.code(410).send({ error: 'Limite de téléchargements atteinte' })
    }

    if (share.password) {
      const ok = await bcrypt.compare(req.body?.password || '', share.password)
      if (!ok) return reply.code(401).send({ error: 'Mot de passe incorrect' })
    }

    const fileExists = await fs.pathExists(share.file.path)
    if (!fileExists) return reply.code(404).send({ error: 'Fichier manquant sur le serveur' })

    await prisma.share.update({
      where: { id: share.id },
      data: { downloads: { increment: 1 } }
    })
    await prisma.file.update({
      where: { id: share.fileId },
      data: { downloads: { increment: 1 } }
    })

    const stream = fs.createReadStream(share.file.path)
    reply.header('Content-Type', share.file.mimeType)
    reply.header(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(share.file.originalName)}"`
    )
    reply.header('Content-Length', share.file.size.toString())
    return reply.send(stream)
  })
}
