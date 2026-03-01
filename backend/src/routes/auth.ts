import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import path from 'path'
import fs from 'fs-extra'
import { nanoid } from 'nanoid'
import { prisma } from '../lib/prisma'
import { z } from 'zod'

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/data/uploads'
const AVATAR_DIR = path.join(UPLOAD_DIR, 'avatars')

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
})

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(['USER', 'ADMIN']).optional().default('USER')
})

export async function authRoutes(app: FastifyInstance) {
  // GET /api/auth/setup — vérifie si le premier utilisateur doit être créé
  app.get('/setup', async (_req, reply) => {
    const count = await prisma.user.count()
    return reply.send({ setupNeeded: count === 0 })
  })

  // POST /api/auth/login
  app.post('/login', async (req, reply) => {
    const body = loginSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Données invalides' })

    const user = await prisma.user.findUnique({ where: { email: body.data.email } })
    if (!user || !user.active) {
      req.log.warn({ email: body.data.email }, 'Tentative de connexion échouée')
      return reply.code(401).send({ error: 'Identifiants incorrects' })
    }

    const ok = await bcrypt.compare(body.data.password, user.password)
    if (!ok) {
      req.log.warn({ email: body.data.email }, 'Tentative de connexion échouée')
      return reply.code(401).send({ error: 'Identifiants incorrects' })
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } })
    req.log.info({ userId: user.id, email: user.email }, 'Connexion réussie')

    const token = app.jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      { expiresIn: '7d' }
    )

    return reply.send({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, avatarUrl: user.avatarUrl ?? null } })
  })

  // GET /api/auth/me — vérifier le token
  app.get('/me', { onRequest: [app.authenticate] }, async (req: any) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, role: true, avatarUrl: true, createdAt: true, lastLogin: true }
    })
    if (!user) throw { statusCode: 401, message: 'Utilisateur introuvable' }
    return user
  })

  // POST /api/auth/register — premier utilisateur OU admin connecté
  app.post('/register', async (req, reply) => {
    const body = registerSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Données invalides' })

    const count = await prisma.user.count()
    // Le 1er utilisateur est toujours admin
    const role = count === 0 ? 'ADMIN' : 'USER'

    // Si ce n'est pas le premier, vérifier que l'appelant est admin OU que l'inscription libre est activée
    if (count > 0) {
      let isAdmin = false
      try {
        await req.jwtVerify()
        const caller = (req as any).user
        if (caller.role === 'ADMIN') isAdmin = true
      } catch { /* non authentifié */ }

      if (!isAdmin) {
        const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } })
        if (!settings?.allowRegistration) {
          return reply.code(403).send({ error: 'Les inscriptions sont désactivées' })
        }
      }
    }

    const existing = await prisma.user.findUnique({ where: { email: body.data.email } })
    if (existing) return reply.code(409).send({ error: 'Cet email est déjà utilisé' })

    const hashed = await bcrypt.hash(body.data.password, 12)
    const user = await prisma.user.create({
      data: { email: body.data.email, name: body.data.name, password: hashed, role },
      select: { id: true, email: true, name: true, role: true, createdAt: true }
    })

    req.log.info({ email: user.email, role: user.role }, 'Utilisateur créé')
    return reply.code(201).send(user)
  })

  // POST /api/auth/avatar — uploader son avatar
  app.post('/avatar', { onRequest: [app.authenticate] }, async (req: any, reply) => {
    await fs.ensureDir(AVATAR_DIR)
    const current = await prisma.user.findUnique({ where: { id: req.user.id }, select: { avatarUrl: true } })
    if (current?.avatarUrl) {
      const oldFile = path.join(UPLOAD_DIR, current.avatarUrl.replace('/uploads/', ''))
      await fs.remove(oldFile).catch(() => {})
    }
    const data = await req.file()
    if (!data) return reply.code(400).send({ error: 'Aucun fichier reçu' })
    const ext = path.extname(data.filename || '.jpg').toLowerCase()
    const allowed = ['.png', '.jpg', '.jpeg', '.webp', '.gif']
    if (!allowed.includes(ext)) {
      return reply.code(400).send({ error: 'Format non supporté (png, jpg, webp, gif)' })
    }
    const filename = `avatar_${req.user.id}_${nanoid(6)}${ext}`
    const filePath = path.join(AVATAR_DIR, filename)
    const chunks: Buffer[] = []
    for await (const chunk of data.file) chunks.push(chunk)
    await fs.writeFile(filePath, Buffer.concat(chunks))
    const avatarUrl = `/uploads/avatars/${filename}`
    await prisma.user.update({ where: { id: req.user.id }, data: { avatarUrl } })
    req.log.debug({ userId: req.user.id }, 'Avatar mis à jour')
    return { avatarUrl }
  })

  // DELETE /api/auth/avatar — supprimer son avatar
  app.delete('/avatar', { onRequest: [app.authenticate] }, async (req: any, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { avatarUrl: true } })
    if (user?.avatarUrl) {
      const file = path.join(UPLOAD_DIR, user.avatarUrl.replace('/uploads/', ''))
      await fs.remove(file).catch(() => {})
    }
    await prisma.user.update({ where: { id: req.user.id }, data: { avatarUrl: null } })
    req.log.debug({ userId: req.user.id }, 'Avatar supprimé')
    return { success: true }
  })

  // PATCH /api/auth/profile — mettre à jour son nom
  app.patch('/profile', { onRequest: [app.authenticate] }, async (req: any, reply) => {
    const { name } = req.body as { name?: string }
    if (!name?.trim()) return reply.code(400).send({ error: 'Nom invalide' })
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { name: name.trim() },
      select: { id: true, email: true, name: true, role: true, avatarUrl: true }
    })
    req.log.debug({ userId: req.user.id }, 'Profil mis à jour')
    return updated
  })

  // POST /api/auth/change-password
  app.post('/change-password', { onRequest: [app.authenticate] }, async (req: any, reply) => {
    const { currentPassword, newPassword } = req.body as any
    if (!currentPassword || !newPassword || newPassword.length < 8) {
      return reply.code(400).send({ error: 'Données invalides' })
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    if (!user) return reply.code(404).send({ error: 'Introuvable' })
    const ok = await bcrypt.compare(currentPassword, user.password)
    if (!ok) return reply.code(400).send({ error: 'Mot de passe actuel incorrect' })
    const hashed = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({ where: { id: req.user.id }, data: { password: hashed } })
    req.log.info({ userId: req.user.id }, 'Mot de passe modifié')
    return { success: true }
  })
}
