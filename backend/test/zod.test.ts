import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
})

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8)
})

const profileSchema = z.object({
  name: z.string().trim().min(1)
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
})

const cleanupPreferenceSchema = z.object({
  cleanupAfterDays: z.number().int().nonnegative().nullable()
})

const tests: { label: string; schema: z.ZodTypeAny; input: unknown; expect: boolean }[] = [
  // loginSchema
  { label: 'login valid', schema: loginSchema, input: { email: 'a@b.com', password: '123' }, expect: true },
  { label: 'login bad email', schema: loginSchema, input: { email: 'pas-email', password: '123' }, expect: false },
  { label: 'login empty password', schema: loginSchema, input: { email: 'a@b.com', password: '' }, expect: false },

  // registerSchema
  { label: 'register valid', schema: registerSchema, input: { email: 'a@b.com', name: 'Damien', password: '12345678' }, expect: true },
  { label: 'register empty name', schema: registerSchema, input: { email: 'a@b.com', name: '', password: '12345678' }, expect: false },
  { label: 'register short password', schema: registerSchema, input: { email: 'a@b.com', name: 'Damien', password: 'court' }, expect: false },

  // profileSchema
  { label: 'profile valid', schema: profileSchema, input: { name: 'Damien' }, expect: true },
  { label: 'profile whitespace only', schema: profileSchema, input: { name: '   ' }, expect: false },

  // changePasswordSchema
  { label: 'changePassword valid', schema: changePasswordSchema, input: { currentPassword: 'old', newPassword: '12345678' }, expect: true },
  { label: 'changePassword short new', schema: changePasswordSchema, input: { currentPassword: 'old', newPassword: 'court' }, expect: false },

  // cleanupPreferenceSchema
  { label: 'cleanup valid number', schema: cleanupPreferenceSchema, input: { cleanupAfterDays: 7 }, expect: true },
  { label: 'cleanup null', schema: cleanupPreferenceSchema, input: { cleanupAfterDays: null }, expect: true },
  { label: 'cleanup negative', schema: cleanupPreferenceSchema, input: { cleanupAfterDays: -1 }, expect: false },
  { label: 'cleanup string', schema: cleanupPreferenceSchema, input: { cleanupAfterDays: 'texte' }, expect: false },
]

let passed = 0
let failed = 0

for (const t of tests) {
  const result = t.schema.safeParse(t.input)
  const ok = result.success === t.expect
  if (ok) {
    passed++
    console.log(`✅ ${t.label}`)
  } else {
    failed++
    console.error(`❌ ${t.label} — attendu: ${t.expect}, obtenu: ${result.success}`)
  }
}

console.log(`\n${passed}/${passed + failed} tests passés`)
if (failed > 0) process.exit(1)
