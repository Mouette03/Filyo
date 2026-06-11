import 'dotenv/config'
import { PrismaClient } from '../../generated/prisma/client.js'

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

const dbUrl = process.env.DATABASE_URL ?? ''

function createPrismaClient(): PrismaClient {
  if (dbUrl.startsWith('file:') || dbUrl === '') {
    // SQLite via better-sqlite3
    // require() intentionnel : ces drivers natifs CJS ne supportent pas l'import ESM statique
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BetterSqlite3 = require('better-sqlite3')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaBetterSQLite3 } = require('@prisma/adapter-better-sqlite3')
    const dbPath = dbUrl.startsWith('file:') ? dbUrl.replace('file:', '') : '/data/filyo.db'
    const database = new BetterSqlite3(dbPath)
    const adapter = new PrismaBetterSQLite3(database)
    return new PrismaClient({ adapter })
  } else {
    // MariaDB / MySQL via mysql2
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mysql = require('mysql2')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaMysql2 } = require('@prisma/adapter-mysql2')
    const pool = mysql.createPool(dbUrl)
    const adapter = new PrismaMysql2(pool)
    return new PrismaClient({ adapter })
  }
}

export const prisma: PrismaClient = global.__prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma
}

// Optimisations SQLite uniquement (ignorées si MariaDB)
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
