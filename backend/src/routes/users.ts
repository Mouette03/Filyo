import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'

// Toutes ces routes nécessitent d'être connecté en tant qu'ADMIN
export async function userRoutes(app: FastifyInstance) {
  const adminOnly = { onRequest: [app.authenticate, app.adminOnly] }

  // GET /api/users
  app.get('/', adminOnly, async () => {
    return prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true, lastLogin: true },
      orderBy: { createdAt: 'asc' }
    })
  })

  // POST /api/users — créer un utilisateur
  app.post<{ Body: { email: string; name: string; password: string; role: string } }>(
    '/',
    adminOnly,
    async (req, reply) => {
      const { email, name, password, role } = req.body
      if (!email || !name || !password) {
        return reply.code(400).send({ error: 'email, name et password sont requis' })
      }
      const existing = await prisma.user.findUnique({ where: { email } })
      if (existing) return reply.code(409).send({ error: 'Cet email est déjà utilisé' })

      const hashed = await bcrypt.hash(password, 12)
      const user = await prisma.user.create({
        data: { email, name, password: hashed, role: role === 'ADMIN' ? 'ADMIN' : 'USER' },
        select: { id: true, email: true, name: true, role: true, active: true, createdAt: true }
      })
      return reply.code(201).send(user)
    }
  )

  // PATCH /api/users/:id — modifier un utilisateur
  app.patch<{ Params: { id: string }; Body: { name?: string; email?: string; role?: string; active?: boolean; password?: string } }>(
    '/:id',
    adminOnly,
    async (req, reply) => {
      const { name, email, role, active, password } = req.body
      const data: any = {}
      if (name !== undefined) data.name = name
      if (email !== undefined) data.email = email
      if (role !== undefined) data.role = role === 'ADMIN' ? 'ADMIN' : 'USER'
      if (active !== undefined) data.active = active
      if (password) data.password = await bcrypt.hash(password, 12)

      try {
        const user = await prisma.user.update({
          where: { id: req.params.id },
          data,
          select: { id: true, email: true, name: true, role: true, active: true, createdAt: true }
        })
        return user
      } catch {
        return reply.code(404).send({ error: 'Utilisateur introuvable' })
      }
    }
  )

  // DELETE /api/users/:id
  app.delete<{ Params: { id: string } }>('/:id', adminOnly, async (req, reply) => {
    const caller = (req as any).user
    if (caller.id === req.params.id) {
      return reply.code(400).send({ error: 'Impossible de supprimer votre propre compte' })
    }
    try {
      await prisma.user.delete({ where: { id: req.params.id } })
      return { success: true }
    } catch {
      return reply.code(404).send({ error: 'Utilisateur introuvable' })
    }
  })
}
