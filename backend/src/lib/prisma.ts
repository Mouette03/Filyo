import { PrismaClient } from '@prisma/client'

declare global {
  var __prisma: PrismaClient | undefined
}

export const prisma = global.__prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma
}

// Optimisations SQLite uniquement (ignorées si MariaDB/Postgres)
const dbUrl = process.env.DATABASE_URL ?? ''
if (dbUrl.startsWith('file:') || dbUrl === '') {
  prisma.$executeRaw`PRAGMA journal_mode=WAL`
    .then(() => prisma.$executeRaw`PRAGMA busy_timeout=10000`)
    .then(() => prisma.$executeRaw`PRAGMA synchronous=NORMAL`)
    .catch((err: unknown) => console.warn('[prisma] Impossible d\'appliquer les pragmas SQLite :', err))
}
