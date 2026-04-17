import path from 'path'
import fs from 'fs-extra'
import { Server } from '@tus/server'
import type { Upload } from '@tus/server'
import { FileStore } from '@tus/file-store'
import { nanoid } from 'nanoid'
import mime from 'mime-types'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { UPLOAD_DIR } from './config'
import { getAppSettings } from './appSettings'
import type { FastifyInstance } from 'fastify'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface TusFileResult {
  id: string
  originalName: string
  mimeType: string
  size: string
  expiresAt: string | null
  shareToken: string
  batchToken: string | null
}

// ── Résultats en mémoire (shareToken etc.) ─────────────────────────────────
// Clé : upload.id  Valeur : résultat + timestamp pour TTL
const tusFileResultsMap = new Map<string, TusFileResult & { _ts: number }>()

// Nettoyage TTL : > 5 min sans consommation → on libère la mémoire
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000
  for (const [key, val] of tusFileResultsMap.entries()) {
    if (val._ts < cutoff) tusFileResultsMap.delete(key)
  }
}, 60_000).unref()

/** Récupère et supprime le résultat d'un upload TUS fichier. */
export function getTusFileResult(uploadId: string): TusFileResult | null {
  const entry = tusFileResultsMap.get(uploadId)
  if (!entry) return null
  tusFileResultsMap.delete(uploadId)
  const { _ts: _, ...result } = entry
  return result
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseCookies(cookieHeader: string | null | undefined): Record<string, string> {
  const cookies: Record<string, string> = {}
  if (!cookieHeader) return cookies
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    cookies[part.slice(0, eq).trim()] = part.slice(eq + 1).trim()
  }
  return cookies
}

function tusReject(statusCode: number, code: string): never {
  // @tus/server expects { status_code, body } to be thrown
  throw { status_code: statusCode, body: JSON.stringify({ code }) }
}

function getTusDir(subdirectory: string): string {
  const dir = path.join(UPLOAD_DIR, subdirectory)
  fs.ensureDirSync(dir)
  return dir
}

const TUS_EXPIRY_MS = (() => {
  const v = parseInt(process.env.TUS_EXPIRY_MS || '', 10)
  return Number.isFinite(v) && v > 0 ? v : 24 * 60 * 60 * 1000 // 24h par défaut
})()

// ── TUS serveur — fichiers (authentifié) ──────────────────────────────────────
export function createFilesTusServer(app: FastifyInstance): Server {
  const tusDir = getTusDir('tus-files')

  const server = new Server({
    path: '/api/files/tus',
    datastore: new FileStore({ directory: tusDir, expirationPeriodInMilliseconds: TUS_EXPIRY_MS }),
    respectForwardedHeaders: false,

    async onUploadCreate(req: unknown, upload: Upload) {
      // 1. Authentification via cookie JWT
      const cookieHeader = (req as any).headers?.get?.('cookie') ?? (req as any).headers?.cookie ?? ''
      const cookies = parseCookies(cookieHeader)
      const token = cookies.token
      if (!token) tusReject(401, 'UNAUTHORIZED')

      let jwtUser: { id: string; email: string; role: string }
      try {
        jwtUser = app.jwt.verify<{ id: string; email: string; role: string }>(token!)
      } catch {
        tusReject(401, 'INVALID_TOKEN')
      }

      const dbUser = await prisma.user.findUnique({
        where: { id: jwtUser!.id },
        select: { id: true, active: true, role: true, storageQuotaBytes: true }
      })
      if (!dbUser || !dbUser.active) tusReject(401, 'INVALID_TOKEN')

      // 2. Vérification taille fichier
      const totalSize = upload.size ?? 0
      const appSettings = await getAppSettings()
      const globalMaxBytes = appSettings.maxFileSizeBytes ?? null
      if (globalMaxBytes !== null && BigInt(totalSize) > globalMaxBytes) {
        tusReject(413, 'FILE_TOO_LARGE')
      }

      // 3. Quota utilisateur
      if (dbUser!.storageQuotaBytes !== null) {
        const [filesAgg, receivedAgg] = await Promise.all([
          prisma.file.aggregate({ _sum: { size: true }, where: { userId: dbUser!.id } }),
          prisma.receivedFile.aggregate({ _sum: { size: true }, where: { uploadRequest: { userId: dbUser!.id } } })
        ])
        const usedBytes = (filesAgg._sum.size ?? BigInt(0)) + (receivedAgg._sum.size ?? BigInt(0))
        if (usedBytes + BigInt(totalSize) > dbUser!.storageQuotaBytes!) {
          tusReject(413, 'QUOTA_EXCEEDED')
        }
      }

      // Ajouter userId aux métadonnées pour le retrouver dans onUploadFinish
      return { metadata: { ...(upload.metadata ?? {}), _userId: dbUser!.id } }
    },

    async onUploadFinish(_req: unknown, upload: Upload) {
      const meta = upload.metadata ?? {}
      const userId = meta._userId || null
      const filename = meta.filename || 'file'
      const mimeType = meta.mimeType || (mime.lookup(filename) || 'application/octet-stream')
      const expiresIn = meta.expiresIn ? parseInt(meta.expiresIn, 10) : null
      const maxDownloads = meta.maxDownloads ? parseInt(meta.maxDownloads, 10) : null
      const rawPassword = meta.password || null
      const hideFilenames = meta.hideFilenames === 'true'
      const batchToken = meta.batchToken || null

      // Déplacer le fichier TUS vers le dossier final
      const tusFilePath = path.join(tusDir, upload.id)
      const ext = path.extname(filename) || ''
      const destFilename = `${nanoid(12)}${ext}`
      const destPath = path.join(UPLOAD_DIR, destFilename)
      await fs.move(tusFilePath, destPath, { overwrite: false })

      const hashedPassword = rawPassword ? await bcrypt.hash(rawPassword, 10) : null
      const expiresAt = expiresIn && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null

      const file = await prisma.file.create({
        data: {
          filename: destFilename,
          originalName: filename,
          mimeType,
          size: BigInt(upload.size ?? 0),
          path: destPath,
          userId: userId || null,
          expiresAt,
          maxDownloads: maxDownloads || null,
          password: hashedPassword,
          batchToken: batchToken || null,
          hideFilenames,
          shares: {
            create: {
              token: nanoid(16),
              expiresAt,
              maxDownloads: maxDownloads || null,
              password: hashedPassword
            }
          }
        },
        include: { shares: true }
      }).catch(async (err: unknown) => {
        await fs.remove(destPath).catch(() => {})
        throw err
      })

      // Nettoyer le fichier .info TUS
      await fs.remove(path.join(tusDir, `${upload.id}.info`)).catch(() => {})

      // Stocker le résultat pour récupération par le client
      tusFileResultsMap.set(upload.id, {
        id: file.id,
        originalName: file.originalName,
        mimeType: file.mimeType,
        size: file.size.toString(),
        expiresAt: file.expiresAt?.toISOString() ?? null,
        shareToken: file.shares[0]?.token ?? '',
        batchToken: file.batchToken,
        _ts: Date.now()
      })

      return {}
    }
  })

  return server
}

// ── TUS serveur — upload requests (public, sans auth) ─────────────────────────
export function createRequestsTusServer(): Server {
  const tusDir = getTusDir('tus-requests')

  const server = new Server({
    path: '/api/upload-requests/tus',
    datastore: new FileStore({ directory: tusDir, expirationPeriodInMilliseconds: TUS_EXPIRY_MS }),
    respectForwardedHeaders: false,

    async onUploadCreate(_req: unknown, upload: Upload) {
      const meta = upload.metadata ?? {}
      const requestToken = meta.requestToken
      if (!requestToken) tusReject(400, 'MISSING_REQUEST_TOKEN')

      const request = await prisma.uploadRequest.findUnique({
        where: { token: requestToken! },
        include: { _count: { select: { receivedFiles: true } } }
      })
      if (!request || !request.active) tusReject(404, 'REQUEST_NOT_FOUND')
      if (request!.expiresAt && request!.expiresAt < new Date()) tusReject(410, 'REQUEST_EXPIRED')
      if (request!.maxFiles && request!._count.receivedFiles >= request!.maxFiles) {
        tusReject(429, 'REQUEST_LIMIT_REACHED')
      }

      // Vérification mot de passe
      if (request!.password) {
        const provided = meta.password ?? ''
        const ok = await bcrypt.compare(provided, request!.password)
        if (!ok) tusReject(401, 'WRONG_PASSWORD')
      }

      // Vérification taille
      const totalSize = upload.size ?? 0
      const appSettings = await getAppSettings()
      const globalMaxBytes = appSettings.maxFileSizeBytes ?? null
      const perRequestMax = request!.maxSizeBytes ?? null
      const effectiveMaxBytes = perRequestMax !== null && globalMaxBytes !== null
        ? (perRequestMax < globalMaxBytes ? perRequestMax : globalMaxBytes)
        : (perRequestMax ?? globalMaxBytes)
      if (effectiveMaxBytes !== null && BigInt(totalSize) > effectiveMaxBytes) {
        tusReject(413, 'FILE_TOO_LARGE')
      }

      // Quota propriétaire
      const ownerId = request!.userId
      if (ownerId) {
        const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { storageQuotaBytes: true } })
        if (owner?.storageQuotaBytes !== null && owner?.storageQuotaBytes !== undefined) {
          const [filesAgg, receivedAgg] = await Promise.all([
            prisma.file.aggregate({ _sum: { size: true }, where: { userId: ownerId } }),
            prisma.receivedFile.aggregate({ _sum: { size: true }, where: { uploadRequest: { userId: ownerId } } })
          ])
          const usedBytes = (filesAgg._sum.size ?? BigInt(0)) + (receivedAgg._sum.size ?? BigInt(0))
          if (usedBytes + BigInt(totalSize) > owner.storageQuotaBytes) {
            tusReject(413, 'QUOTA_EXCEEDED')
          }
        }
      }

      // Stocker l'uploadRequestId dans les métadonnées
      return { metadata: { ...meta, _uploadRequestId: request!.id } }
    },

    async onUploadFinish(_req: unknown, upload: Upload) {
      const meta = upload.metadata ?? {}
      const uploadRequestId = meta._uploadRequestId
      if (!uploadRequestId) throw { status_code: 500, body: JSON.stringify({ code: 'MISSING_REQUEST_ID' }) }

      const filename = meta.filename || 'file'
      const mimeType = meta.mimeType || (mime.lookup(filename) || 'application/octet-stream')
      const uploaderName = meta.uploaderName || null
      const uploaderEmail = meta.uploaderEmail || null
      const message = meta.message || null

      // Déplacer vers le dossier received
      const tusFilePath = path.join(tusDir, upload.id)
      const ext = path.extname(filename) || ''
      const destFilename = `recv_${nanoid(12)}${ext}`
      const destDir = path.join(UPLOAD_DIR, 'received', uploadRequestId)
      await fs.ensureDir(destDir)
      const destPath = path.join(destDir, destFilename)
      await fs.move(tusFilePath, destPath, { overwrite: false })

      await prisma.receivedFile.create({
        data: {
          uploadRequestId,
          filename: destFilename,
          originalName: filename,
          mimeType,
          size: BigInt(upload.size ?? 0),
          path: destPath,
          uploaderName,
          uploaderEmail,
          message
        }
      }).catch(async (err: unknown) => {
        await fs.remove(destPath).catch(() => {})
        throw err
      })

      // Nettoyer le fichier .info TUS
      await fs.remove(path.join(tusDir, `${upload.id}.info`)).catch(() => {})

      return {}
    }
  })

  return server
}

/** Nettoyage des fichiers TUS incomplets expirés (appelé depuis le job de cleanup). */
export async function cleanupExpiredTusUploads(): Promise<number> {
  let cleaned = 0
  for (const subdir of ['tus-files', 'tus-requests']) {
    const dir = path.join(UPLOAD_DIR, subdir)
    if (!await fs.pathExists(dir)) continue
    const entries = await fs.readdir(dir).catch(() => [] as string[])
    for (const entry of entries) {
      // Les fichiers .info contiennent les métadonnées TUS dont creation_date
      if (!entry.endsWith('.info')) continue
      const infoPath = path.join(dir, entry)
      try {
        const info = await fs.readJson(infoPath)
        const creationDate = info.creation_date ? new Date(info.creation_date) : null
        if (creationDate && Date.now() - creationDate.getTime() > TUS_EXPIRY_MS) {
          const id = entry.replace(/\.info$/, '')
          await fs.remove(path.join(dir, id)).catch(() => {})
          await fs.remove(infoPath).catch(() => {})
          cleaned++
        }
      } catch {
        // Ignorer les erreurs de lecture
      }
    }
  }
  return cleaned
}
