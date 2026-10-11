/**
 * Test de la commande de secours 2FA (dist/cli/two-factor.js) : démarre le vrai serveur sur une base
 * SQLite temporaire, active la 2FA et la rend obligatoire, puis vérifie list / reset / disable-policy.
 * Prérequis : `npm run build`.
 */
import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../dist/generated/prisma/client.js'

const backend = fileURLToPath(new URL('../', import.meta.url))
const JWT_SECRET = 'e2e-test-secret-e2e-test-secret-0123456789'
process.env.JWT_SECRET = JWT_SECRET
const tf = await import('../dist/lib/twoFactor.js')

async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)) })
    srv.on('error', reject)
  })
}

function tokenCookie(res) {
  for (const c of res.headers.getSetCookie()) {
    const m = c.match(/^token=([^;]*)/)
    if (m && m[1]) return `token=${m[1]}`
  }
  return null
}

test('Two-factor recovery command (dist/cli/two-factor.js)', { timeout: 120_000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'filyo-2fa-cli-'))
  const url = `file:${path.join(dir, 'cli.db')}`
  const port = await freePort()
  const base = `http://127.0.0.1:${port}/api`
  let server
  let db
  // Lance la commande comme dans le conteneur ; --allow-root seulement si le test tourne en root.
  const cli = (...args) => {
    const extra = process.getuid?.() === 0 ? ['--allow-root'] : []
    const r = spawnSync(process.execPath, ['dist/cli/two-factor.js', ...args, ...extra], {
      cwd: backend, env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000
    })
    return { code: r.status, out: r.stdout + r.stderr }
  }
  try {
    execFileSync(path.join(backend, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], {
      cwd: backend, env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe', timeout: 60_000
    })
    server = spawn(process.execPath, ['dist/index.js'], {
      cwd: backend,
      env: { ...process.env, DATABASE_URL: url, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'production', LOG_LEVEL: 'silent', JWT_SECRET, UPLOAD_DIR: path.join(dir, 'uploads') },
      stdio: 'pipe'
    })
    for (let i = 0; ; i++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break } catch { /* démarrage */ }
      if (i > 100) throw new Error('server did not start')
      await new Promise(r => setTimeout(r, 200))
    }
    db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) })
    const call = async (method, route, { body, cookie } = {}) => {
      const res = await fetch(base + route, {
        method,
        headers: { ...(body !== undefined && { 'content-type': 'application/json' }), ...(cookie && { cookie }) },
        body: body !== undefined ? JSON.stringify(body) : undefined
      })
      const text = await res.text()
      return { status: res.status, data: text ? JSON.parse(text) : null, cookie: tokenCookie(res) }
    }

    // ── Admin avec 2FA, 2FA obligatoire ──
    assert.equal((await call('POST', '/auth/register', { body: { email: 'Admin@Example.com', name: 'Admin', password: 'admin-password' } })).status, 201)
    let r = await call('POST', '/auth/login', { body: { email: 'Admin@Example.com', password: 'admin-password' } })
    let admin = r.cookie
    r = await call('POST', '/auth/2fa/setup', { cookie: admin, body: { password: 'admin-password' } })
    r = await call('POST', '/auth/2fa/enable', { cookie: admin, body: { code: tf.totp(r.data.secret) } })
    assert.equal(r.status, 200)
    admin = r.cookie
    assert.equal((await call('PATCH', '/settings/two-factor', { cookie: admin, body: { required: true } })).status, 200)

    // ── Aide et erreurs d'usage ──
    assert.equal(cli('--help').code, 0)
    assert.equal(cli().code, 2)
    assert.equal(cli('unknown').code, 2)
    assert.equal(cli('reset').code, 2, 'email required')

    // ── list : état 2FA et politique, aucun secret affiché ──
    r = cli('list')
    assert.equal(r.code, 0, r.out)
    assert.match(r.out, /2FA policy: REQUIRED/)
    assert.match(r.out, /Admin@Example\.com/)
    assert.match(r.out, /enabled/)
    const stored = await db.user.findUnique({ where: { email: 'Admin@Example.com' } })
    assert.ok(!r.out.includes(stored.twoFactorSecret), 'secret never printed')

    // ── reset : refus sans terminal ni --yes, e-mail inconnu ──
    r = cli('reset', 'admin@example.com')
    assert.equal(r.code, 2, r.out)
    assert.match(r.out, /--yes/)
    assert.equal((await db.user.findUnique({ where: { id: stored.id } })).twoFactorEnabled, true, 'nothing changed without confirmation')
    assert.equal(cli('reset', 'nobody@example.com', '--yes').code, 1)

    // ── reset --yes (casse différente tolérée) ──
    r = cli('reset', 'admin@example.com', '--yes')
    assert.equal(r.code, 0, r.out)
    const after = await db.user.findUnique({ where: { id: stored.id } })
    assert.equal(after.twoFactorEnabled, false)
    assert.equal(after.twoFactorSecret, null)
    assert.equal(after.sessionVersion, stored.sessionVersion + 1)
    assert.equal(await db.twoFactorRecoveryCode.count({ where: { userId: stored.id } }), 0)
    assert.equal((await call('GET', '/auth/me', { cookie: admin })).status, 401, 'sessions signed out')
    assert.equal(cli('reset', 'Admin@Example.com', '--yes').code, 0, 'idempotent')

    // Mot de passe seul accepté, mais configuration 2FA imposée (politique toujours obligatoire)
    r = await call('POST', '/auth/login', { body: { email: 'Admin@Example.com', password: 'admin-password' } })
    assert.equal(r.status, 200)
    assert.equal(r.data.requiresTwoFactor, undefined)
    assert.equal(r.data.user.twoFactorSetupRequired, true)

    // ── disable-policy ──
    r = cli('disable-policy', '--yes')
    assert.equal(r.code, 0, r.out)
    assert.equal((await db.appSettings.findUnique({ where: { id: 'singleton' } })).twoFactorRequired, false)
    assert.match(cli('list').out, /2FA policy: optional/)
    assert.match(cli('disable-policy', '--yes').out, /already optional/)
    r = await call('POST', '/auth/login', { body: { email: 'Admin@Example.com', password: 'admin-password' } })
    assert.equal(r.data.user.twoFactorSetupRequired, false)

    // ── Refus en root avec SQLite (sauf --allow-root) ──
    if (process.getuid?.() === 0) {
      const res = spawnSync(process.execPath, ['dist/cli/two-factor.js', 'list'], { cwd: backend, env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8' })
      assert.equal(res.status, 1)
      assert.match(res.stderr, /-u node/)
    }
  } finally {
    if (db) await db.$disconnect()
    if (server) server.kill()
    rmSync(dir, { recursive: true, force: true })
  }
})
