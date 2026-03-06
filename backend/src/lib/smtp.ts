import nodemailer from 'nodemailer'

interface SmtpConfig {
  smtpHost: string
  smtpPort?: number | null
  smtpUser?: string | null
  smtpPass?: string | null
}

/**
 * Crée un transporter nodemailer à partir de la configuration SMTP.
 * - Port 465  → SSL/TLS direct (secure: true)
 * - Port 587  → STARTTLS (requireTLS: true)
 * - Autres    → non sécurisé
 */
export function createSmtpTransport(cfg: SmtpConfig) {
  const port = cfg.smtpPort ?? 587
  const secure = port === 465
  return nodemailer.createTransport({
    host: cfg.smtpHost,
    port,
    secure,
    requireTLS: port === 587,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    auth: cfg.smtpUser ? { user: cfg.smtpUser, pass: cfg.smtpPass ?? '' } : undefined
  })
}
