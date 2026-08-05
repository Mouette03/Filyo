import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations'
  },
  datasource: {
    // process.env direct (pas env()) : `prisma generate` doit fonctionner en CI sans DATABASE_URL
    url: process.env.DATABASE_URL ?? 'file:./dev.db'
  }
})
