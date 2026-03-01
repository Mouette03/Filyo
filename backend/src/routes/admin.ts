import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma'
import fs from 'fs-extra'
import path from 'path'
import { execSync } from 'child_process'

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/data/uploads'

function getDiskSpace(dir: string): { total: string; used: string; free: string; totalBytes: number; usedBytes: number; freeBytes: number } {
  try {
    // Linux / macOS / Docker
    const out = execSync(`df -Pk "${dir}" 2>/dev/null || df -k "${dir}"`, { timeout: 3000 }).toString()
    const lines = out.trim().split('\n')
    const parts = lines[lines.length - 1].trim().split(/\s+/)
    const totalB = parseInt(parts[1]) * 1024
    const usedB  = parseInt(parts[2]) * 1024
    const freeB  = parseInt(parts[3]) * 1024
    const fmt = (b: number) => {
      if (b >= 1e12) return (b / 1e12).toFixed(1) + ' TB'
      if (b >= 1e9)  return (b / 1e9).toFixed(1) + ' GB'
      if (b >= 1e6)  return (b / 1e6).toFixed(1) + ' MB'
      return (b / 1e3).toFixed(0) + ' KB'
    }
    return { total: fmt(totalB), used: fmt(usedB), free: fmt(freeB), totalBytes: totalB, usedBytes: usedB, freeBytes: freeB }
  } catch {
    return { total: '—', used: '—', free: '—', totalBytes: 0, usedBytes: 0, freeBytes: 0 }
  }
}

export async function adminRoutes(app: FastifyInstance) {
  const authHook = { onRequest: [app.authenticate, app.adminOnly] }

  // GET /api/admin/stats
  app.get('/stats', authHook, async () => {
    const [filesCount, sharesCount, uploadRequestsCount, receivedFilesCount] = await Promise.all([
      prisma.file.count(),
      prisma.share.count(),
      prisma.uploadRequest.count(),
      prisma.receivedFile.count()
    ])

    const totalSize = await prisma.file.aggregate({ _sum: { size: true } })
    const totalReceivedSize = await prisma.receivedFile.aggregate({ _sum: { size: true } })

    const disk = getDiskSpace(UPLOAD_DIR)

    return {
      filesCount,
      sharesCount,
      uploadRequestsCount,
      receivedFilesCount,
      totalSize: (totalSize._sum.size ?? BigInt(0)).toString(),
      totalReceivedSize: (totalReceivedSize._sum.size ?? BigInt(0)).toString(),
      disk
    }
  })

  // POST /api/admin/cleanup - Supprimer les fichiers expirés
  app.post('/cleanup', authHook, async () => {
    const now = new Date()

    const expiredFiles = await prisma.file.findMany({
      where: { expiresAt: { lt: now } }
    })

    for (const file of expiredFiles) {
      await fs.remove(file.path).catch(() => {})
    }
    const deletedFiles = await prisma.file.deleteMany({
      where: { expiresAt: { lt: now } }
    })

    const expiredRequests = await prisma.uploadRequest.findMany({
      where: { expiresAt: { lt: now } },
      include: { receivedFiles: true }
    })
    for (const req of expiredRequests) {
      for (const f of req.receivedFiles) {
        await fs.remove(f.path).catch(() => {})
      }
      // Supprimer le dossier du partage inversé
      await fs.remove(path.join(UPLOAD_DIR, 'received', req.id)).catch(() => {})
    }
    const deletedRequests = await prisma.uploadRequest.deleteMany({
      where: { expiresAt: { lt: now } }
    })

    return {
      deletedFiles: deletedFiles.count,
      deletedUploadRequests: deletedRequests.count
    }
  })

  // GET /api/admin/files - Tous les fichiers de tous les utilisateurs
  app.get('/files', authHook, async () => {
    const files = await prisma.file.findMany({
      orderBy: { uploadedAt: 'desc' },
      include: {
        shares: true,
        user: { select: { id: true, name: true, email: true } }
      }
    })
    return files.map((f: any) => ({
      ...f,
      size: f.size.toString()
    }))
  })

  // GET /api/admin/upload-requests - Toutes les demandes de depot
  app.get('/upload-requests', authHook, async () => {
    const requests = await prisma.uploadRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { receivedFiles: true } },
        user: { select: { id: true, name: true, email: true } }
      }
    })
    return requests.map((r: any) => ({
      ...r,
      maxSizeBytes: r.maxSizeBytes?.toString(),
      filesCount: r._count.receivedFiles
    }))
  })
}
