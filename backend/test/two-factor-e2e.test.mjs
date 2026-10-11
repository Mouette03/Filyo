/**
 * Test de bout en bout de la 2FA : démarre le vrai serveur (dist/index.js) sur une base SQLite
 * temporaire et rejoue les parcours connexion, enrôlement, 2FA obligatoire et auto-inscription.
 * Prérequis : `npm run build`.
 */
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
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

test('Two-factor authentication end-to-end', { timeout: 120_000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'filyo-2fa-'))
  const url = `file:${path.join(dir, 'e2e.db')}`
  const port = await freePort()
  const base = `http://127.0.0.1:${port}/api`
  let server
  let db
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
    const nextCode = (secret) => tf.hotp(secret, tf.currentStep() + 1) // période suivante : jamais encore utilisée

    // ── Premier admin, connexion sans 2FA (parcours inchangé) ──
    assert.equal((await call('POST', '/auth/register', { body: { email: 'admin@example.com', name: 'Admin', password: 'admin-password' } })).status, 201)
    let r = await call('POST', '/auth/login', { body: { email: 'admin@example.com', password: 'admin-password' } }) // login 1
    assert.equal(r.status, 200)
    assert.equal(r.data.user.twoFactorSetupRequired, false)
    let admin = r.cookie
    assert.ok(admin)

    // ── Impossible d'imposer la 2FA tant que l'admin ne l'a pas configurée ──
    r = await call('PATCH', '/settings/two-factor', { cookie: admin, body: { required: true } })
    assert.equal(r.status, 400)
    assert.equal(r.data.code, 'ADMIN_TWO_FACTOR_REQUIRED_FIRST')

    // ── Enrôlement admin ──
    assert.equal((await call('POST', '/auth/2fa/setup', { cookie: admin, body: { password: 'wrong' } })).data.code, 'WRONG_PASSWORD')
    r = await call('POST', '/auth/2fa/setup', { cookie: admin, body: { password: 'admin-password' } })
    assert.equal(r.status, 200)
    assert.match(r.data.qrSvg, /^<svg/)
    const adminSecret = r.data.secret
    const stored = await db.user.findUnique({ where: { email: 'admin@example.com' } })
    assert.ok(stored.twoFactorPendingSecret.startsWith('enc:'), 'pending secret encrypted')
    assert.equal(stored.twoFactorEnabled, false, 'not enabled before first code')
    assert.equal((await call('POST', '/auth/2fa/enable', { cookie: admin, body: { code: '000000' } })).data.code, 'INVALID_TWO_FACTOR_CODE')
    r = await call('POST', '/auth/2fa/enable', { cookie: admin, body: { code: tf.totp(adminSecret) } })
    assert.equal(r.status, 200)
    assert.equal(r.data.recoveryCodes.length, 10)
    const recoveryCodes = r.data.recoveryCodes
    const oldAdmin = admin
    admin = r.cookie
    assert.ok(admin && admin !== oldAdmin)
    assert.equal((await call('GET', '/auth/me', { cookie: oldAdmin })).status, 401, 'old sessions revoked')
    const hashes = await db.twoFactorRecoveryCode.findMany()
    assert.ok(hashes.every(h => !recoveryCodes.some(c => h.codeHash.includes(c.replace('-', '')))), 'recovery codes hashed')

    // ── Politique : 2FA obligatoire + inscription libre ──
    assert.equal((await call('PATCH', '/settings/two-factor', { cookie: admin, body: { required: true } })).status, 200)
    assert.equal((await call('PATCH', '/settings/registration', { cookie: admin, body: { allowRegistration: true } })).status, 200)
    assert.equal((await call('GET', '/settings')).data.twoFactorRequired, true)

    // ── Auto-inscription : session limitée à la configuration 2FA ──
    r = await call('POST', '/auth/register', { body: { email: 'bob@example.com', name: 'Bob', password: 'bob-password' } })
    assert.equal(r.status, 201)
    assert.equal(r.data.twoFactorRequired, true)
    r = await call('POST', '/auth/login', { body: { email: 'bob@example.com', password: 'bob-password' } }) // login 2
    assert.equal(r.data.user.twoFactorSetupRequired, true)
    let bob = r.cookie
    assert.equal((await call('GET', '/files', { cookie: bob })).data.code, 'TWO_FACTOR_SETUP_REQUIRED')
    assert.equal((await call('GET', '/auth/quota', { cookie: bob })).status, 403)
    assert.equal((await call('GET', '/auth/me', { cookie: bob })).data.twoFactorSetupRequired, true)
    assert.equal((await call('GET', '/auth/2fa/status', { cookie: bob })).status, 200)
    r = await call('POST', '/auth/2fa/setup', { cookie: bob, body: { password: 'bob-password' } })
    r = await call('POST', '/auth/2fa/enable', { cookie: bob, body: { code: tf.totp(r.data.secret) } })
    assert.equal(r.status, 200)
    bob = r.cookie
    assert.equal((await call('GET', '/files', { cookie: bob })).status, 200, 'full access after setup')
    assert.equal((await call('GET', '/auth/me', { cookie: bob })).data.twoFactorEnabled, true)

    // ── Connexion admin en deux étapes ──
    r = await call('POST', '/auth/login', { body: { email: 'admin@example.com', password: 'admin-password' } }) // login 3
    assert.equal(r.status, 200)
    assert.equal(r.data.requiresTwoFactor, true)
    assert.equal(r.cookie, null, 'no session after password only')
    assert.equal(r.data.user, undefined)
    let challengeToken = r.data.challengeToken
    r = await call('POST', '/auth/2fa/verify', { body: { challengeToken, code: '000000' } })
    assert.equal(r.status, 401)
    assert.equal(r.data.attemptsRemaining, 4)
    r = await call('POST', '/auth/2fa/verify', { body: { challengeToken, code: recoveryCodes[0].toLowerCase() } })
    assert.equal(r.status, 200)
    assert.equal(r.data.method, 'recovery')
    assert.equal(r.data.recoveryCodesRemaining, 9)
    assert.ok(r.cookie)
    admin = r.cookie
    assert.equal((await call('POST', '/auth/2fa/verify', { body: { challengeToken, code: nextCode(adminSecret) } })).data.code, 'TWO_FACTOR_CHALLENGE_EXPIRED', 'challenge single use')

    r = await call('POST', '/auth/login', { body: { email: 'admin@example.com', password: 'admin-password' } }) // login 4
    challengeToken = r.data.challengeToken
    assert.equal((await call('POST', '/auth/2fa/verify', { body: { challengeToken, code: recoveryCodes[0] } })).data.code, 'INVALID_TWO_FACTOR_CODE', 'recovery code single use')
    const totpCode = nextCode(adminSecret)
    r = await call('POST', '/auth/2fa/verify', { body: { challengeToken, code: totpCode } })
    assert.equal(r.status, 200)
    assert.equal(r.data.method, 'totp')
    admin = r.cookie

    // ── Désactivation interdite quand la 2FA est obligatoire ──
    assert.equal((await call('POST', '/auth/2fa/disable', { cookie: admin, body: { password: 'admin-password', code: recoveryCodes[1] } })).data.code, 'TWO_FACTOR_REQUIRED_BY_POLICY')

    // ── Réinitialisation de la 2FA de Bob par l'admin ──
    const bobUser = await db.user.findUnique({ where: { email: 'bob@example.com' } })
    assert.equal((await call('POST', `/users/${bobUser.id}/2fa/reset`, { cookie: admin })).status, 200)
    assert.equal((await call('GET', '/auth/me', { cookie: bob })).status, 401, 'bob sessions revoked')
    const users = (await call('GET', '/users', { cookie: admin })).data
    assert.equal(users.find(u => u.email === 'bob@example.com').twoFactorEnabled, false)

    // ── Réinitialisation du mot de passe : la 2FA reste active ──
    const adminUser = await db.user.findUnique({ where: { email: 'admin@example.com' } })
    await db.user.update({ where: { id: adminUser.id }, data: { resetToken: 'reset-token-e2e', resetTokenExpiry: new Date(Date.now() + 60_000) } })
    assert.equal((await call('POST', '/auth/reset-password', { body: { token: 'reset-token-e2e', password: 'new-admin-password' } })).status, 200)
    assert.equal((await call('GET', '/auth/me', { cookie: admin })).status, 401, 'sessions revoked by password reset')
    r = await call('POST', '/auth/login', { body: { email: 'admin@example.com', password: 'new-admin-password' } }) // login 5
    assert.equal(r.data.requiresTwoFactor, true, '2FA still required after password reset')
  } finally {
    if (db) await db.$disconnect()
    if (server) server.kill()
    rmSync(dir, { recursive: true, force: true })
  }
})
