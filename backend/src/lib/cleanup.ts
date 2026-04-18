import fs from 'fs-extra'
import path from 'path'
import { prisma } from './prisma'
import { UPLOAD_DIR } from './config'
import { getAppSettings } from './appSettings'
export { cleanupExpiredTusUploads } from './tus'

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
export async function runScheduledCleanup(): Promise<{ deletedFiles: number }> {
  const settings = await getAppSettings()
  const adminMax = settings.cleanupAfterDays ?? null

  if (adminMax == null) return { deletedFiles: 0 }

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

  return { deletedFiles: filesToDelete.length }
}

/**
 * Nettoyage forcé (admin) : supprime TOUT ce qui est expiré,
 * sans tenir compte des préférences ni des délais de grâce.
 */
export async function runForceCleanup(): Promise<{ deletedFiles: number }> {
  const now = new Date()

  const expiredFiles = await prisma.file.findMany({
    where: { expiresAt: { not: null, lt: now } }
  })
  for (const file of expiredFiles) await fs.remove(file.path).catch(() => {})
  if (expiredFiles.length) {
    await prisma.file.deleteMany({ where: { id: { in: expiredFiles.map(f => f.id) } } })
  }

  return { deletedFiles: expiredFiles.length }
}

