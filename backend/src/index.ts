import Fastify, { FastifyRequest, FastifyReply } from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import jwt from '@fastify/jwt'
import staticFiles from '@fastify/static'
import rateLimit from '@fastify/rate-limit'
import helmet from '@fastify/helmet'
import path from 'path'
import { existsSync, readFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { prisma } from './lib/prisma'
import { fileRoutes } from './routes/files'
import { shareRoutes } from './routes/shares'
import { uploadRequestRoutes } from './routes/uploadRequests'
import { adminRoutes } from './routes/admin'
import { authRoutes } from './routes/auth'
import { userRoutes } from './routes/users'
import { settingsRoutes } from './routes/settings'
import { runScheduledCleanup, cleanupOrphanedChunks } from './lib/cleanup'
import { UPLOAD_DIR } from './lib/config'

const appVersion: string = (() => {
  try {
    return (JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf-8')) as { version?: string }).version ?? 'unknown'
  } catch {
    return process.env.APP_VERSION ?? 'unknown'
  }
})()

const UPLOAD_TIMEOUT_MIN_MS = 60_000        // 1 min
const UPLOAD_TIMEOUT_MAX_MS = 7_200_000     // 2 h
const UPLOAD_TIMEOUT_DEFAULT_MS = 1_800_000 // 30 min

const _parsedTimeout = parseInt(process.env.UPLOAD_TIMEOUT_MS ?? '', 10)
const UPLOAD_TIMEOUT_MS = Number.isFinite(_parsedTimeout) && _parsedTimeout >= UPLOAD_TIMEOUT_MIN_MS && _parsedTimeout <= UPLOAD_TIMEOUT_MAX_MS
  ? _parsedTimeout
  : UPLOAD_TIMEOUT_DEFAULT_MS

const isDev = process.env.NODE_ENV !== 'production'

const rawTrustProxy = process.env.TRUST_PROXY ?? 'false'
const trustProxyValue: boolean | string = rawTrustProxy === 'true' ? true : rawTrustProxy === 'false' ? false : rawTrustProxy

const app = Fastify({
  trustProxy: trustProxyValue,
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    ...(isDev && {
      transport: {
        target: 'pino-pretty',
        level: process.env.LOG_LEVEL || 'info',
        options: { colorize: true }
      }
    })
  },
  disableRequestLogging: true,
  bodyLimit: 10 * 1024 * 1024 * 1024, // 10 GB
  connectionTimeout: UPLOAD_TIMEOUT_MS,
})

// ── Décorateurs d'authentification ──────────────────────────────────────────
app.decorate('authenticate', async function (req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify()
    // Vérifier que l'utilisateur existe toujours en base (protège contre tokens d'anciennes instances)
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, active: true, role: true }
    })
    if (!user || !user.active) {
      return reply.code(401).send({ code: 'INVALID_TOKEN' })
    }
    // Rafraîchir le rôle depuis la DB pour éviter des tokens avec des rôles obsolètes
    req.user.role = user.role
  } catch {
    return reply.code(401).send({ code: 'INVALID_TOKEN' })
  }
})

app.decorate('adminOnly', async function (req: FastifyRequest, reply: FastifyReply) {
  const user = (req as any).user
  if (!user || user.role !== 'ADMIN') {
    return reply.code(403).send({ code: 'ADMIN_ONLY' })
  }
})

async function bootstrap() {
  // Rate limiting — 200 req/min par IP par défaut sur toutes les routes.
  // Les routes sensibles (login, forgot-password…) définissent leur propre config.rateLimit
  // plus restrictive via { config: { rateLimit: { max, timeWindow } } }.
  await app.register(rateLimit, {
    global: true,
    max: 200,
    timeWindow: '1 minute',
    onExceeded: (req, key) => {
      const route = (req as any).routeOptions?.url ?? req.url.split('?')[0]
      req.log.warn({ key, route, method: req.method }, 'Rate limit exceeded')
    }
  })

  // CORS — en production (NODE_ENV=production), le frontend est servi par ce même serveur
  // (même origine), donc CORS n'est pas nécessaire.
  // En développement, on autorise explicitement l'origine du dev server Vite.
  const corsOrigin = !isDev
    ? false
    : (process.env.FRONTEND_URL || 'http://localhost:5173')
  await app.register(cors, {
    origin: corsOrigin,
    credentials: true
  })

  // Cookie — doit être enregistré avant JWT
  await app.register(cookie)

  // JWT
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set (use a random 32+ character string)')
  await app.register(jwt, {
    secret: process.env.JWT_SECRET,
    cookie: { cookieName: 'token', signed: false }
  })

  // Sécurité HTTP headers
  // CSP désactivée : les autres headers (X-Frame-Options, X-Content-Type-Options,
  // Referrer-Policy…) restent actifs et protègent contre clickjacking, MIME sniffing, etc.
  // La CSP fine sur SPA React/Vite nécessite une configuration avancée (nonces/hashes).
  await app.register(helmet, {
    contentSecurityPolicy: false
  })

  // Multipart (file upload)
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 * 1024 } // 10 GB
  })

  // Servir les fichiers statiques uploadés (logos…)
  await app.register(staticFiles, { root: UPLOAD_DIR, prefix: '/uploads/' })

  // ── Gestionnaire d'erreurs global ──────────────────────────────────────────
  app.setErrorHandler((err, req, reply) => {
    const e = err as Error & { statusCode?: number; code?: string }
    const status = e.statusCode ?? 500

    // Déconnexion client en cours d'upload — pas une erreur serveur
    if (e.message === 'Premature close' || e.code === 'ERR_STREAM_PREMATURE_CLOSE') {
      req.log.warn({ req: { method: req.method, url: req.url }, user: (req as any).user?.id ?? null }, 'Client disconnected mid-upload')
      if (!reply.sent) void reply.code(499).send()
      return
    }

    if (status >= 500) {
      req.log.error({
        err: { message: e.message, stack: e.stack, name: e.name },
        req: { method: req.method, url: req.url, id: req.id },
        user: (req as any).user?.id ?? null
      }, `Unhandled error: ${e.message}`)
    }
    void reply.code(status).send({ error: e.message || 'Internal server error' })
  })

  // ── Routes ──
  await app.register(authRoutes,          { prefix: '/api/auth' })
  await app.register(userRoutes,          { prefix: '/api/users' })
  await app.register(settingsRoutes,      { prefix: '/api/settings' })
  await app.register(fileRoutes,          { prefix: '/api/files' })
  await app.register(shareRoutes,         { prefix: '/api/shares' })
  await app.register(uploadRequestRoutes, { prefix: '/api/upload-requests' })
  await app.register(adminRoutes,         { prefix: '/api/admin' })

  // Health check
  app.get('/health', async () => ({ status: 'ok', version: appVersion }))

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
    try {
      const deleted = await cleanupOrphanedChunks()
      if (deleted > 0) app.log.info({ deleted }, '🧹 Orphaned chunks cleaned')
    } catch (err) {
      app.log.error(err, 'Orphaned chunks cleanup failed')
    }
  }
  // Premier passage 1 min après le démarrage, puis toutes les heures
  setTimeout(() => { cleanupJob(); setInterval(cleanupJob, 60 * 60 * 1000) }, 60 * 1000)
}

bootstrap().catch(console.error)
