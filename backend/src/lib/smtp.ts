import nodemailer from 'nodemailer'

interface SmtpConfig {
  smtpHost: string | null
  smtpPort?: number | null
  smtpUser?: string | null
  smtpPass?: string | null
  smtpSecure?: boolean | null
}

/**
 * Crée un transporter nodemailer à partir de la configuration SMTP.
 * - smtpSecure=true  → STARTTLS activé (requireTLS: true)
 * - smtpSecure=false → connexion non sécurisée
 * - Port 465         → SSL/TLS direct (secure: true, ignore smtpSecure)
 */
export function createSmtpTransport(cfg: SmtpConfig) {
  const port = cfg.smtpPort ?? 587
  const isSsl = port === 465
  const starttls = !isSsl && (cfg.smtpSecure ?? true)
  return nodemailer.createTransport({
    host: cfg.smtpHost ?? undefined,
    port,
    secure: isSsl,
    requireTLS: starttls,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
<<<<<<< Updated upstream
    auth: cfg.smtpUser ? { user: cfg.smtpUser, pass: cfg.smtpPass ?? '' } : undefined
=======
    auth: cfg.smtpUser ? {
      user: cfg.smtpUser,
      pass: (() => {
        if (!cfg.smtpPass) return ''
        try { return decrypt(cfg.smtpPass, process.env.JWT_SECRET || '') }
        catch { return cfg.smtpPass } // fallback : valeur legacy en clair
      })()
    } : undefined
>>>>>>> Stashed changes
  })
}
