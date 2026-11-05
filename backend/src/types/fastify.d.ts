import 'fastify'
import { FastifyRequest, FastifyReply } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void>
    adminOnly(req: FastifyRequest, reply: FastifyReply): Promise<void>
  }

  interface FastifyContextConfig {
    /**
     * Route accessible à un compte qui doit encore configurer la 2FA obligatoire
     * (profil minimal, statut et enrôlement 2FA). Toutes les autres routes protégées
     * renvoient 403 TWO_FACTOR_SETUP_REQUIRED tant que la configuration n'est pas terminée.
     */
    allowTwoFactorSetup?: boolean
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; email: string; name: string; role: string; sv?: number }
    user: { id: string; email: string; name: string; role: string; sv?: number }
  }
}
