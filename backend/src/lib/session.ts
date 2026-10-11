import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from './prisma.js'

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7 // 7 jours

export interface SessionUser {
  id: string
  email: string
  name: string
  role: string
  sessionVersion: number
}

/**
 * Crée le JWT de session et le place dans le cookie httpOnly `token`.
 * `sv` (sessionVersion) permet d'invalider toutes les sessions d'un compte en incrémentant
 * User.sessionVersion (changement de mot de passe, activation/désactivation de la 2FA…).
 */
export function setSessionCookie(app: FastifyInstance, reply: FastifyReply, user: SessionUser): void {
  const token = app.jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role, sv: user.sessionVersion },
    { expiresIn: '7d' }
  )
  reply.setCookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS
  })
}

/** Indique si l'administrateur a rendu la 2FA obligatoire pour tous les comptes. */
export async function isTwoFactorRequired(): Promise<boolean> {
  const s = await prisma.appSettings.findUnique({
    where: { id: 'singleton' },
    select: { twoFactorRequired: true }
  })
  return s?.twoFactorRequired ?? false
}

export type SessionCheck =
  | { ok: true; user: { id: string; role: string; twoFactorEnabled: boolean }; setupRequired: boolean }
  | { ok: false }

/**
 * Vérifie le cookie de session : signature JWT, compte actif, sessionVersion à jour.
 * `setupRequired` est vrai si la 2FA est obligatoire et que le compte ne l'a pas encore configurée :
 * la session ne donne alors accès qu'aux routes de configuration de la 2FA.
 */
export async function checkSession(req: FastifyRequest): Promise<SessionCheck> {
  try {
    await req.jwtVerify()
  } catch {
    return { ok: false }
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, active: true, role: true, sessionVersion: true, twoFactorEnabled: true }
  })
  if (!user || !user.active) return { ok: false }
  // Les jetons émis avant l'introduction de sessionVersion n'ont pas de `sv` : ils valent 0.
  if ((req.user.sv ?? 0) !== user.sessionVersion) return { ok: false }
  const setupRequired = !user.twoFactorEnabled && await isTwoFactorRequired()
  return { ok: true, user: { id: user.id, role: user.role, twoFactorEnabled: user.twoFactorEnabled }, setupRequired }
}
