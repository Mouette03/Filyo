import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'

// Toutes ces routes nécessitent d'être connecté en tant qu'ADMIN
export async function userRoutes(app: FastifyInstance) {
  const adminOnly = { onRequest: [app.authenticate, app.adminOnly] }

  // GET /api/users
  app.get('/', adminOnly, async () => {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true, lastLogin: true, storageQuotaBytes: true },
      orderBy: { createdAt: 'asc' }
    })
    const [filesRows, receivedRows] = await Promise.all([
      prisma.file.groupBy({ by: ['userId'], _sum: { size: true } }),
      prisma.receivedFile.groupBy({
        by: ['uploadRequestId'],
        _sum: { size: true },
        where: { uploadRequest: { userId: { in: users.map((u: { id: string }) => u.id) } } }
      })
    ])
    // Récupérer les uploadRequestId → userId pour agréger les ReceivedFile par propriétaire
    const requestIds = receivedRows.map((r: { uploadRequestId: string }) => r.uploadRequestId)
    const requestOwners = requestIds.length > 0
      ? await prisma.uploadRequest.findMany({
          where: { id: { in: requestIds } },
          select: { id: true, userId: true }
        })
      : []
    const requestOwnerMap = new Map<string, string>(
      requestOwners
        .filter((r): r is { id: string; userId: string } => r.userId !== null)
        .map(r => [r.id, r.userId] as [string, string])
    )
    const receivedByUser = new Map<string, bigint>()
    for (const row of receivedRows) {
      const uid = requestOwnerMap.get(row.uploadRequestId)
      if (uid) {
        receivedByUser.set(uid, (receivedByUser.get(uid) ?? BigInt(0)) + (row._sum.size ?? BigInt(0)))
      }
    }
    const filesMap = new Map<string, bigint>(
      filesRows.filter((r: { userId: string | null; _sum: { size: bigint | null } }) => r.userId).map((r: { userId: string | null; _sum: { size: bigint | null } }) => [r.userId!, r._sum.size ?? BigInt(0)] as [string, bigint])
    )
    return users.map((u: { id: string; storageQuotaBytes?: bigint | null; [key: string]: unknown }) => ({
      ...u,
      storageQuotaBytes: u.storageQuotaBytes?.toString() ?? null,
      storageUsedBytes: ((filesMap.get(u.id) ?? BigInt(0)) + (receivedByUser.get(u.id) ?? BigInt(0))).toString()
    }))
  })

  // POST /api/users — créer un utilisateur
  app.post<{ Body: { email: string; name: string; password: string; role: string; storageQuotaMB?: number | null } }>(
    '/',
    adminOnly,
    async (req, reply) => {
      const { email, name, password, role, storageQuotaMB } = req.body
      if (!email || !name || !password) {
        return reply.code(400).send({ code: 'MISSING_FIELDS' })
      }
      const existing = await prisma.user.findUnique({ where: { email } })
      if (existing) return reply.code(409).send({ code: 'EMAIL_TAKEN' })

      const hashed = await bcrypt.hash(password, 12)
      const storageQuotaBytes = storageQuotaMB != null && storageQuotaMB > 0
        ? BigInt(Math.round(storageQuotaMB * 1024 * 1024))
        : null
      const user = await prisma.user.create({
        data: { email, name, password: hashed, role: role === 'ADMIN' ? 'ADMIN' : 'USER', storageQuotaBytes },
        select: { id: true, email: true, name: true, role: true, active: true, createdAt: true, storageQuotaBytes: true }
      })
      req.log.info({ email, role: user.role }, 'User created by admin')
      return reply.code(201).send({ ...user, storageQuotaBytes: user.storageQuotaBytes?.toString() ?? null, storageUsedBytes: '0' })
    }
  )

  // PATCH /api/users/:id — modifier un utilisateur
  app.patch<{ Params: { id: string }; Body: { name?: string; email?: string; role?: string; active?: boolean; password?: string; storageQuotaMB?: number | null } }>(
    '/:id',
    adminOnly,
    async (req, reply) => {
      const caller = req.user
      const { name, email, role, active, password, storageQuotaMB } = req.body
      const isSelf = caller.id === req.params.id

      // Bloquer auto-rétrogradation et auto-désactivation
      if (isSelf && role !== undefined && role !== 'ADMIN') {
        return reply.code(400).send({ code: 'CANNOT_DEMOTE_SELF' })
      }
      if (isSelf && active === false) {
        return reply.code(400).send({ code: 'CANNOT_DEACTIVATE_SELF' })
      }

      // Vérifier qu'il reste au moins un autre admin actif avant de rétrograder/désactiver
      if (!isSelf && (role === 'USER' || active === false)) {
        const target = await prisma.user.findUnique({ where: { id: req.params.id } })
        if (target?.role === 'ADMIN') {
          const otherActiveAdmins = await prisma.user.count({
            where: { role: 'ADMIN', active: true, id: { not: req.params.id } }
          })
          if (otherActiveAdmins === 0) {
            return reply.code(400).send({ code: 'LAST_ADMIN' })
          }
        }
      }

      const data: any = {}
      if (name !== undefined) data.name = name
      if (email !== undefined) data.email = email
      if (role !== undefined) data.role = role === 'ADMIN' ? 'ADMIN' : 'USER'
      if (active !== undefined) data.active = active
      if (password) data.password = await bcrypt.hash(password, 12)
      if (storageQuotaMB !== undefined) {
        data.storageQuotaBytes = storageQuotaMB != null && storageQuotaMB > 0
          ? BigInt(Math.round(storageQuotaMB * 1024 * 1024))
          : null
      }

      let user: { id: string; email: string; name: string; role: string; active: boolean; createdAt: Date; storageQuotaBytes: bigint | null }
      try {
        user = await prisma.user.update({
          where: { id: req.params.id },
          data,
          select: { id: true, email: true, name: true, role: true, active: true, createdAt: true, storageQuotaBytes: true }
        })
        req.log.info({ id: req.params.id }, 'User updated by admin')
      } catch (err: any) {
        if (err?.code === 'P2002') return reply.code(409).send({ code: 'EMAIL_TAKEN' })
        if (err?.code === 'P2025') return reply.code(404).send({ code: 'USER_NOT_FOUND' })
        req.log.error({ err, id: req.params.id }, 'Failed to update user')
        return reply.code(500).send({ code: 'INTERNAL_ERROR' })
      }

      const [usedAgg, receivedAgg] = await Promise.all([
        prisma.file.aggregate({ _sum: { size: true }, where: { userId: req.params.id } }),
        prisma.receivedFile.aggregate({ _sum: { size: true }, where: { uploadRequest: { userId: req.params.id } } })
      ])
      const storageUsedBytes = ((usedAgg._sum.size ?? BigInt(0)) + (receivedAgg._sum.size ?? BigInt(0))).toString()
      return { ...user, storageQuotaBytes: user.storageQuotaBytes?.toString() ?? null, storageUsedBytes }
    }
  )

  // DELETE /api/users/:id
  app.delete<{ Params: { id: string } }>('/:id', adminOnly, async (req, reply) => {
    const caller = (req as any).user
    if (caller.id === req.params.id) {
      return reply.code(400).send({ code: 'CANNOT_DELETE_SELF' })
    }
    try {
      await prisma.user.delete({ where: { id: req.params.id } })
      req.log.info({ id: req.params.id }, 'User deleted by admin')
      return { success: true }
    } catch {
      return reply.code(404).send({ code: 'USER_NOT_FOUND' })
    }
  })
}
