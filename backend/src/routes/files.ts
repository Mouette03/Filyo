import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fs from 'fs-extra'
import { prisma } from '../lib/prisma'
import { createFilesTusServer, getTusFileResult } from '../lib/tus'

export async function fileRoutes(app: FastifyInstance) {
  const auth = { onRequest: [app.authenticate] }
  const tusServer = createFilesTusServer(app)

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

  // Extrait le batchToken du header Upload-Metadata (format TUS : "key base64val,key base64val,...")
  const getBatchToken = (req: FastifyRequest): string | null => {
    const meta = (req.headers['upload-metadata'] as string | undefined) ?? ''
    for (const part of meta.split(',')) {
      const [key, val] = part.trim().split(' ')
      if (key === 'batchToken' && val) {
        try { return Buffer.from(val, 'base64').toString('utf8') } catch { return null }
      }
    }
    return null
  }

  // POST /tus : création d'un slot d'upload par fichier.
  // Clé = IP:batchToken si lot → tous les fichiers du même lot partagent le compteur.
  // Clé = IP seule si fichier isolé → limite plus stricte.
  app.all('/tus', {
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute',
        keyGenerator: (req) => {
          const batch = getBatchToken(req)
          return batch ? `${req.ip}:batch:${batch}` : req.ip
        }
      }
    }
  }, handleTus)
  app.all('/tus/*', { config: { rateLimit: { max: 200, timeWindow: '1 minute', keyGenerator: (req) => req.ip } } }, handleTus)

  // GET /api/files/tus-result/:uploadId — Récupère le résultat d'un upload TUS terminé
  // Appelé par le client après onSuccess de tus-js-client
  app.get<{ Params: { uploadId: string } }>('/tus-result/:uploadId', auth, async (req, reply) => {
    // Tentative 1 : map en mémoire (cas nominal) — vérifie l'ownership via userId
    const result = getTusFileResult(req.params.uploadId, req.user.id)
    if (result) return result

    // Tentative 2 : fallback DB (redémarrage entre PATCH et GET) — userId dans le where pour éviter l'IDOR
    const file = await prisma.file.findUnique({
      where: { tusUploadId: req.params.uploadId, userId: req.user.id },
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
      await prisma.$transaction([
        prisma.file.update({ where: { id: req.params.id }, data: { expiresAt } }),
        prisma.share.updateMany({ where: { fileId: req.params.id }, data: { expiresAt } })
      ])
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
      await prisma.$transaction([
        prisma.file.update({ where: { id: req.params.id }, data: { maxDownloads: maxDownloads ?? null } }),
        prisma.share.updateMany({ where: { fileId: req.params.id }, data: { maxDownloads: maxDownloads ?? null } })
      ])
      return { maxDownloads }
    }
  )
}
