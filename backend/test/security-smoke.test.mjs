import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import nodemailer from 'nodemailer'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../dist/generated/prisma/client.js'
import { createSmtpTransport } from '../dist/lib/smtp.js'

const backend = fileURLToPath(new URL('../', import.meta.url))

test('Prisma migrates SQLite without npm/npx, including a second startup', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'filyo-security-'))
  let client
  try {
    const bin = path.join(dir, 'bin')
    mkdirSync(bin)
    symlinkSync(process.execPath, path.join(bin, 'node'))
    const url = `file:${path.join(dir, 'smoke.db')}`
    const env = { ...process.env, PATH: bin, DATABASE_URL: url }
    const cli = path.join(backend, 'node_modules/.bin/prisma')
    for (let attempt = 0; attempt < 2; attempt++) {
      execFileSync(cli, ['migrate', 'deploy'], {
        cwd: backend, env, timeout: 60_000, stdio: 'pipe'
      })
    }
    client = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) })
    assert.equal(await client.user.count(), 0)
    assert.equal(await client.appSettings.count(), 0)
  } finally {
    if (client) await client.$disconnect()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Nodemailer composes mail locally and preserves Filyo TLS options', async () => {
  // No message is sent over the network.
  const transport = nodemailer.createTransport({
    streamTransport: true, buffer: true, newline: 'unix'
  })
  const result = await transport.sendMail({
    from: 'sender@example.invalid',
    to: 'recipient@example.invalid',
    subject: 'Filyo security smoke test',
    text: 'Local composition only',
    html: '<p>Local composition only</p>'
  })
  assert.match(result.message.toString(), /Filyo security smoke test/)
  assert.match(result.message.toString(), /Local composition only/)
  transport.close()

  for (const [port, secure, requireTLS] of [[465, true, false], [587, false, true]]) {
    const smtp = createSmtpTransport({ smtpHost: 'smtp.example.invalid', smtpPort: port })
    assert.equal(smtp.options.secure, secure)
    assert.equal(smtp.options.requireTLS, requireTLS)
    smtp.close()
  }
})
