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
  ;(async () => {
    try {
      await prisma.$queryRaw`PRAGMA journal_mode=WAL`
      await prisma.$queryRaw`PRAGMA busy_timeout=10000`
      await prisma.$queryRaw`PRAGMA synchronous=NORMAL`
    } catch (err: unknown) {
      console.warn('[prisma] Impossible d\'appliquer les pragmas SQLite :', err)
    }
  })()
}
