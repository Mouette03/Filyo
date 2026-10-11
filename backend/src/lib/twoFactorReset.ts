import type { PrismaClient } from '../generated/prisma/client.js'

/**
 * Désactive la 2FA d'un utilisateur et supprime tout ce qui y est lié :
 * secret, enrôlement en attente, codes de secours, connexions en attente.
 * Les sessions ouvertes sont révoquées (sessionVersion + 1).
 * Utilisé par la route admin et par la commande de secours (src/cli/two-factor.ts).
 */
export async function resetUserTwoFactor(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorPendingSecret: null,
        twoFactorPendingExpiry: null,
        twoFactorLastUsedStep: null,
        twoFactorEnabledAt: null,
        sessionVersion: { increment: 1 }
      }
    }),
    prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
    prisma.twoFactorChallenge.deleteMany({ where: { userId } })
  ])
}
