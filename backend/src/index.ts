import Fastify, { FastifyRequest, FastifyReply } from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import jwt from '@fastify/jwt'
import staticFiles from '@fastify/static'
import path from 'path'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { fileRoutes } from './routes/files'
import { shareRoutes } from './routes/shares'
import { uploadRequestRoutes } from './routes/uploadRequests'
import { adminRoutes } from './routes/admin'
import { authRoutes } from './routes/auth'
import { userRoutes } from './routes/users'
import { settingsRoutes } from './routes/settings'
import { runScheduledCleanup } from './lib/cleanup'

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: {
      target: 'pino-pretty',
      level: process.env.LOG_LEVEL || 'info',
      options: { colorize: true }
    }
  },
  disableRequestLogging: true,
  bodyLimit: 10 * 1024 * 1024 * 1024 // 10 GB
})

// ── Décorateurs d'authentification ──────────────────────────────────────────
app.decorate('authenticate', async function (req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify()
  } catch {
    return reply.code(401).send({ error: 'Token invalide ou manquant' })
  }
})

app.decorate('adminOnly', async function (req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user
  if (!user || user.role !== 'ADMIN') {
    return reply.code(403).send({ error: 'Accès réservé aux administrateurs' })
  }
})

async function bootstrap() {
  // CORS
  await app.register(cors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
  })

  // JWT
  await app.register(jwt, {
    secret: process.env.JWT_SECRET || 'filyo-super-secret-change-me-in-production'
  })

  // Multipart (file upload)
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 * 1024 } // 10 GB
  })

  // Servir les fichiers statiques uploadés (logos…)
  const UPLOAD_DIR = process.env.UPLOAD_DIR || '/data/uploads'
  await app.register(staticFiles, { root: UPLOAD_DIR, prefix: '/uploads/' })

  // ── Routes ──
  await app.register(authRoutes,          { prefix: '/api/auth' })
  await app.register(userRoutes,          { prefix: '/api/users' })
  await app.register(settingsRoutes,      { prefix: '/api/settings' })
  await app.register(fileRoutes,          { prefix: '/api/files' })
  await app.register(shareRoutes,         { prefix: '/api/shares' })
  await app.register(uploadRequestRoutes, { prefix: '/api/upload-requests' })
  await app.register(adminRoutes,         { prefix: '/api/admin' })

  // Health check
  app.get('/health', async () => ({ status: 'ok', version: '1.0.0' }))

  // ── Servir le frontend React (production) ─────────────────────
  const FRONTEND_DIST = process.env.FRONTEND_DIST
  if (FRONTEND_DIST && existsSync(FRONTEND_DIST)) {
    // Fichiers statiques (JS, CSS, images…)
    await app.register(staticFiles, {
      root: FRONTEND_DIST,
      prefix: '/',
      wildcard: false,
      decorateReply: false, // déjà enregistré pour /uploads/
    })

    // SPA fallback : toute route non-API → index.html (React Router)
    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/uploads/')) {
        return reply.code(404).send({ error: 'Not found' })
      }
      const html = await readFile(path.join(FRONTEND_DIST, 'index.html'), 'utf-8')
      return reply.type('text/html').send(html)
    })
  }

  const port = parseInt(process.env.PORT || '3001')
  const host = process.env.HOST || '0.0.0.0'

  await app.listen({ port, host })
  app.log.info(`🚀 Filyo backend running on http://${host}:${port}`)

  // ── Job de nettoyage automatique (toutes les heures) ──────────────────────────────────
  async function cleanupJob() {
    try {
      const result = await runScheduledCleanup()
      if (result.deletedFiles > 0 || result.deletedRequests > 0) {
        app.log.info(result, '🧹 Auto-cleanup completed')
      }
    } catch (err) {
      app.log.error(err, 'Auto-cleanup failed')
    }
  }
  // Premier passage 1 min après le démarrage, puis toutes les heures
  setTimeout(() => { cleanupJob(); setInterval(cleanupJob, 60 * 60 * 1000) }, 60 * 1000)
}

bootstrap().catch(console.error)
