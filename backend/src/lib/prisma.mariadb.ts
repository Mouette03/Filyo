import { PrismaClient } from '../../generated/prisma/client.js'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'

declare global {
  var __prisma: PrismaClient | undefined
}

// DATABASE_URL au format mysql://user:pass@host:port/db, l'adapter attend des options structurées
const dbUrl = new URL(process.env.DATABASE_URL ?? '')
const adapter = new PrismaMariaDb({
  host: dbUrl.hostname,
  port: dbUrl.port ? parseInt(dbUrl.port, 10) : 3306,
  user: decodeURIComponent(dbUrl.username),
  password: decodeURIComponent(dbUrl.password),
  database: dbUrl.pathname.replace(/^\//, ''),
  connectionLimit: 10
})

export const prisma = global.__prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma
}
