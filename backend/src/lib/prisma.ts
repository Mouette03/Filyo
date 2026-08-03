import { PrismaClient } from '../generated/prisma/client.js'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

declare global {
  var __prisma: PrismaClient | undefined
}

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || 'file:./dev.db' })

export const prisma = global.__prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma
}

// Optimisations SQLite (cette variante n'est utilisée que pour le provider sqlite)
;(async () => {
  try {
    await prisma.$queryRaw`PRAGMA journal_mode=WAL`
    await prisma.$queryRaw`PRAGMA busy_timeout=10000`
    await prisma.$queryRaw`PRAGMA synchronous=NORMAL`
  } catch (err: unknown) {
    console.warn('[prisma] Impossible d\'appliquer les pragmas SQLite :', err)
  }
})()
