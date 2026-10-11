import assert from 'node:assert/strict'
import test from 'node:test'

process.env.JWT_SECRET ??= 'unit-test-secret-unit-test-secret-0000'

const tf = await import('../dist/lib/twoFactor.js')

// RFC 6238, annexe B — secret ASCII "12345678901234567890", HMAC-SHA1, 8 chiffres
const RFC_SECRET = tf.base32Encode(Buffer.from('12345678901234567890', 'ascii'))
const RFC_VECTORS = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130']
]

test('Base32 round-trip and RFC 4648 encoding', () => {
  assert.equal(RFC_SECRET, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
  assert.equal(tf.base32Decode(RFC_SECRET).toString('ascii'), '12345678901234567890')
  const secret = tf.generateTotpSecret()
  assert.equal(secret.length, 32)
  assert.equal(tf.base32Decode(secret).length, 20)
})

test('HOTP/TOTP match the RFC 6238 test vectors', () => {
  for (const [time, expected] of RFC_VECTORS) {
    const step = Math.floor(time / 30)
    assert.equal(tf.hotp(RFC_SECRET, step, 8), expected, `T=${time}`)
    assert.equal(tf.totp(RFC_SECRET, time * 1000), expected.slice(-6), `T=${time} (6 digits)`)
  }
})

test('verifyTotp accepts ±1 period and rejects replays', () => {
  const now = 1_700_000_000_000
  const step = tf.currentStep(now)
  const secret = tf.generateTotpSecret()
  assert.equal(tf.verifyTotp(secret, tf.hotp(secret, step), null, now), step)
  assert.equal(tf.verifyTotp(secret, tf.hotp(secret, step - 1), null, now), step - 1)
  assert.equal(tf.verifyTotp(secret, tf.hotp(secret, step + 1), null, now), step + 1)
  assert.equal(tf.verifyTotp(secret, tf.hotp(secret, step - 2), null, now), null)
  assert.equal(tf.verifyTotp(secret, tf.hotp(secret, step), step, now), null, 'replay refused')
  assert.equal(tf.verifyTotp(secret, '12 34 5', null, now), null)
  assert.equal(tf.verifyTotp(secret, 'abcdef', null, now), null)
})

test('Recovery codes: format, normalisation and hashing', () => {
  const codes = tf.generateRecoveryCodes()
  assert.equal(codes.length, 10)
  assert.equal(new Set(codes).size, 10)
  for (const code of codes) {
    assert.match(code, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/)
    assert.equal(tf.hashRecoveryCode(code), tf.hashRecoveryCode(code.toLowerCase().replace('-', ' ')))
  }
  assert.equal(tf.normalizeRecoveryCode('123456'), null)
  assert.notEqual(tf.hashRecoveryCode(codes[0]), tf.hashRecoveryCode(codes[1]))
})

test('Secrets are encrypted at rest and otpauth URL is well formed', async () => {
  const secret = tf.generateTotpSecret()
  const stored = tf.encryptSecret(secret)
  assert.ok(stored.startsWith('enc:'))
  assert.ok(!stored.includes(secret))
  assert.equal(tf.decryptSecret(stored), secret)
  assert.throws(() => tf.decryptSecret(secret))
  const url = tf.buildOtpauthUrl(secret, 'alice@example.com', 'Filyo')
  assert.match(url, /^otpauth:\/\/totp\/Filyo%3Aalice%40example\.com\?/)
  assert.match(url, new RegExp(`secret=${secret}`))
  const svg = await tf.buildQrSvg(url)
  assert.match(svg, /^<svg/)
})
