import fs from 'fs-extra'
import path from 'path'
import { prisma } from './prisma'
import { UPLOAD_DIR } from './config'
import { getAppSettings } from './appSettings'

/**
 * Nettoyage planifié automatique.
 *
 * Règle de priorité :
 *   1. AppSettings.cleanupAfterDays = maximum autorisé par l'admin
 *      - null → nettoyage automatique GLOBALEMENT désactivé
 *   2. User.cleanupAfterDays = préférence personnelle de l'utilisateur
 *      - null → suit le défaut admin (opt-out : même durée que adminMax)
 *      - 0…N  → N jours après expiration (capé au max admin)
 */
export async function runScheduledCleanup(): Promise<{ deletedFiles: number; deletedRequests: number }> {
  const settings = await getAppSettings()
  const adminMax = settings.cleanupAfterDays ?? null

  // Si l'admin n'a pas activé le nettoyage → rien à faire
  if (adminMax == null) return { deletedFiles: 0, deletedRequests: 0 }

  const now = Date.now()

  // ── Fichiers normaux expirés ──────────────────────────────────
  const expiredFiles = await prisma.file.findMany({
    where: { expiresAt: { not: null, lt: new Date() } },
    include: { user: { select: { cleanupAfterDays: true } } }
  })

  const filesToDelete = expiredFiles.filter(file => {
    // null = l'utilisateur suit le défaut admin (opt-out)
    const userPref = file.user?.cleanupAfterDays ?? adminMax
    const effective = Math.min(userPref, adminMax)  // capé au max admin
    const cutoff = new Date(file.expiresAt!.getTime() + effective * 86_400_000)
    return cutoff.getTime() <= now
  })

  for (const file of filesToDelete) await fs.remove(file.path).catch(() => {})
  if (filesToDelete.length) {
    await prisma.file.deleteMany({ where: { id: { in: filesToDelete.map(f => f.id) } } })
  }

  // ── Demandes de dépôt expirées ────────────────────────────────
  const expiredRequests = await prisma.uploadRequest.findMany({
    where: { expiresAt: { not: null, lt: new Date() } },
    include: {
      receivedFiles: true,
      user: { select: { cleanupAfterDays: true } }
    }
  })

  const requestsToDelete = expiredRequests.filter(req => {
    // null = l'utilisateur suit le défaut admin (opt-out)
    const userPref = req.user?.cleanupAfterDays ?? adminMax
    const effective = Math.min(userPref, adminMax)
    const cutoff = new Date(req.expiresAt!.getTime() + effective * 86_400_000)
    return cutoff.getTime() <= now
  })

  for (const req of requestsToDelete) {
    for (const f of req.receivedFiles) await fs.remove(f.path).catch(() => {})
    await fs.remove(path.join(UPLOAD_DIR, 'received', req.id)).catch(() => {})
  }
  if (requestsToDelete.length) {
    await prisma.uploadRequest.deleteMany({ where: { id: { in: requestsToDelete.map(r => r.id) } } })
  }

  return { deletedFiles: filesToDelete.length, deletedRequests: requestsToDelete.length }
}

/**
 * Nettoyage des uploads chunked orphelins (> 4h sans finalisation).
 * Couvre à la fois ChunkedUpload (dépôt public) et FileChunkedUpload (admin).
 */
export async function cleanupOrphanedChunks(): Promise<number> {
  const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000)

  const orphans = await prisma.chunkedUpload.findMany({
    where: { createdAt: { lt: cutoff } }
  })
  for (const c of orphans) {
    await fs.remove(path.join(UPLOAD_DIR, 'chunks', c.id)).catch(() => {})
  }
  if (orphans.length) {
    await prisma.chunkedUpload.deleteMany({ where: { id: { in: orphans.map(c => c.id) } } })
  }

  const fileOrphans = await prisma.fileChunkedUpload.findMany({
    where: { createdAt: { lt: cutoff } }
  })
  for (const c of fileOrphans) {
    await fs.remove(path.join(UPLOAD_DIR, 'chunks', c.id)).catch(() => {})
  }
  if (fileOrphans.length) {
    await prisma.fileChunkedUpload.deleteMany({ where: { id: { in: fileOrphans.map(c => c.id) } } })
  }

  return orphans.length + fileOrphans.length
}

/**
 * Nettoyage forcé (admin) : supprime TOUT ce qui est expiré,
 * sans tenir compte des préférences ni des délais de grâce.
 */
export async function runForceCleanup(): Promise<{ deletedFiles: number; deletedRequests: number }> {
  const now = new Date()

  const expiredFiles = await prisma.file.findMany({
    where: { expiresAt: { not: null, lt: now } }
  })
  for (const file of expiredFiles) await fs.remove(file.path).catch(() => {})
  if (expiredFiles.length) {
    await prisma.file.deleteMany({ where: { id: { in: expiredFiles.map(f => f.id) } } })
  }

  const expiredRequests = await prisma.uploadRequest.findMany({
    where: { expiresAt: { not: null, lt: now } },
    include: { receivedFiles: true }
  })
  for (const req of expiredRequests) {
    for (const f of req.receivedFiles) await fs.remove(f.path).catch(() => {})
    await fs.remove(path.join(UPLOAD_DIR, 'received', req.id)).catch(() => {})
  }
  if (expiredRequests.length) {
    await prisma.uploadRequest.deleteMany({ where: { id: { in: expiredRequests.map(r => r.id) } } })
  }

  return { deletedFiles: expiredFiles.length, deletedRequests: expiredRequests.length }
}

