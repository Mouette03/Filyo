/**
 * Verrouillage 2FA par compte : 10 codes invalides, même répartis sur plusieurs challenges
 * et plusieurs adresses IP, bloquent la vérification 2FA du compte pendant 15 minutes.
 * Démarre le vrai serveur (dist/index.js) sur une base SQLite temporaire. Prérequis : `npm run build`.
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
const JWT_SECRET = 'lockout-test-secret-lockout-test-secret-0123'
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

test('Two-factor account lockout', { timeout: 120_000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'filyo-2fa-lock-'))
  const url = `file:${path.join(dir, 'lock.db')}`
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
      // TRUST_PROXY : chaque phase utilise une autre IP (X-Forwarded-For) pour simuler un attaquant
      // distribué et rester sous les limites de débit par IP.
      env: { ...process.env, DATABASE_URL: url, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'production', LOG_LEVEL: 'silent', JWT_SECRET, TRUST_PROXY: 'true', UPLOAD_DIR: path.join(dir, 'uploads') },
      stdio: 'pipe'
    })
    for (let i = 0; ; i++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break } catch { /* démarrage */ }
      if (i > 100) throw new Error('server did not start')
      await new Promise(r => setTimeout(r, 200))
    }
    db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) })

    const call = async (method, route, { body, cookie, ip = '198.51.100.1' } = {}) => {
      const res = await fetch(base + route, {
        method,
        headers: { 'x-forwarded-for': ip, ...(body !== undefined && { 'content-type': 'application/json' }), ...(cookie && { cookie }) },
        body: body !== undefined ? JSON.stringify(body) : undefined
      })
      const text = await res.text()
      return { status: res.status, headers: res.headers, data: text ? JSON.parse(text) : null, cookie: tokenCookie(res) }
    }
    const creds = { email: 'admin@example.com', password: 'admin-password' }
    const account = () => db.user.findUnique({ where: { email: creds.email } })
    const unusedCurrentCode = async (secret) => {
      const user = await account()
      const nextPeriod = (user.twoFactorLastUsedStep + 1) * tf.TOTP_PERIOD_SECONDS * 1000
      if (nextPeriod > Date.now()) await new Promise(resolve => setTimeout(resolve, nextPeriod - Date.now() + 100))
      return tf.totp(secret)
    }
    const login = (ip) => call('POST', '/auth/login', { ip, body: creds })
    const verify = (ip, challengeToken, code) => call('POST', '/auth/2fa/verify', { ip, body: { challengeToken, code } })

    // ── Admin avec 2FA activée ──
    assert.equal((await call('POST', '/auth/register', { body: { email: creds.email, name: 'Admin', password: creds.password } })).status, 201)
    let r = await login('198.51.100.1')
    const admin = r.cookie
    r = await call('POST', '/auth/2fa/setup', { cookie: admin, body: { password: creds.password } })
    const secret = r.data.secret
    assert.equal((await call('POST', '/auth/2fa/enable', { cookie: admin, body: { code: tf.totp(secret) } })).status, 200)

    // ── Un succès remet le compteur à zéro ──
    r = await login('198.51.100.2')
    assert.equal(r.data.requiresTwoFactor, true)
    assert.equal((await verify('198.51.100.2', r.data.challengeToken, '000000')).status, 401)
    assert.equal((await account()).twoFactorFailedAttempts, 1)
    r = await verify('198.51.100.2', r.data.challengeToken, await unusedCurrentCode(secret))
    assert.equal(r.status, 200)
    assert.equal((await account()).twoFactorFailedAttempts, 0, 'success resets the account counter')

    // ── 5 échecs : le challenge est épuisé, mais le compteur du compte continue ──
    r = await login('203.0.113.1')
    let challengeToken = r.data.challengeToken
    for (let i = 0; i < 5; i++) {
      r = await verify('203.0.113.1', challengeToken, '000000')
      assert.equal(r.status, 401)
    }
    assert.equal(r.data.attemptsRemaining, 0)
    assert.equal((await account()).twoFactorFailedAttempts, 5)

    // ── Nouveau challenge depuis une autre IP : il ne remet pas le compteur du compte à zéro ──
    r = await login('203.0.113.2')
    challengeToken = r.data.challengeToken
    for (let i = 0; i < 4; i++) assert.equal((await verify('203.0.113.2', challengeToken, '000000')).status, 401)
    assert.equal((await account()).twoFactorFailedAttempts, 9)
    r = await verify('203.0.113.2', challengeToken, '000000')
    assert.equal(r.status, 429, '10th invalid code locks the account')
    assert.equal(r.data.code, 'TWO_FACTOR_LOCKED')
    assert.ok(r.data.retryAfterSeconds > 14 * 60 && r.data.retryAfterSeconds <= 15 * 60)
    assert.equal(r.headers.get('retry-after'), String(r.data.retryAfterSeconds))
    let stored = await account()
    assert.ok(stored.twoFactorLockedUntil > new Date(Date.now() + 14 * 60_000))
    assert.equal(await db.twoFactorChallenge.count({ where: { userId: stored.id } }), 0, 'pending challenges revoked')

    // ── Compte verrouillé : même un bon mot de passe n'ouvre aucun challenge ──
    r = await login('203.0.113.3')
    assert.equal(r.status, 429)
    assert.equal(r.data.code, 'TWO_FACTOR_LOCKED')
    assert.equal(r.data.challengeToken, undefined)
    assert.equal(await db.twoFactorChallenge.count({ where: { userId: stored.id } }), 0)
    // Le verrou ne révèle rien sur un mauvais mot de passe.
    r = await call('POST', '/auth/login', { ip: '203.0.113.3', body: { email: creds.email, password: 'wrong-password' } })
    assert.equal(r.status, 401)

    // ── La commande de secours `reset` lève le verrou ──
    execFileSync(process.execPath, ['dist/cli/two-factor.js', 'reset', creds.email, '--yes', ...(process.getuid?.() === 0 ? ['--allow-root'] : [])], {
      cwd: backend, env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe', timeout: 30_000
    })
    stored = await account()
    assert.equal(stored.twoFactorLockedUntil, null)
    assert.equal(stored.twoFactorFailedAttempts, 0)
    assert.equal(stored.twoFactorEnabled, false)

    // ── Verrou expiré : la connexion 2FA refonctionne ──
    r = await call('POST', '/auth/2fa/setup', { ip: '192.0.2.1', cookie: (await login('192.0.2.1')).cookie, body: { password: creds.password } })
    const secret2 = r.data.secret
    r = await call('POST', '/auth/2fa/enable', { ip: '192.0.2.1', cookie: (await login('192.0.2.2')).cookie, body: { code: tf.totp(secret2) } })
    assert.equal(r.status, 200)
    await db.user.update({ where: { email: creds.email }, data: { twoFactorLockedUntil: new Date(Date.now() - 1000), twoFactorFailedAttempts: 0 } })
    r = await login('192.0.2.3')
    assert.equal(r.data.requiresTwoFactor, true, 'expired lock no longer blocks login')
    r = await verify('192.0.2.3', r.data.challengeToken, await unusedCurrentCode(secret2))
    assert.equal(r.status, 200)
    assert.equal((await account()).twoFactorLockedUntil, null, 'success clears an expired lock')
  } finally {
    await db?.$disconnect()
    server?.kill()
    rmSync(dir, { recursive: true, force: true })
  }
})
