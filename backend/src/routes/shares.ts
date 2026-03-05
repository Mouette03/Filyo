import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import fs from 'fs-extra'
import nodemailer from 'nodemailer'
import { prisma } from '../lib/prisma'

export async function shareRoutes(app: FastifyInstance) {
  // GET /api/shares/:token/info - Info publique (sans téléchargement)
  app.get<{ Params: { token: string } }>('/:token/info', async (req, reply) => {
    const share = await prisma.share.findUnique({
      where: { token: req.params.token },
      include: { file: true }
    })
    if (!share) return reply.code(404).send({ error: 'Lien invalide' })

    if (share.expiresAt && share.expiresAt < new Date()) {
      return reply.code(410).send({ error: 'Ce lien a expiré' })
    }
    if (share.maxDownloads && share.downloads >= share.maxDownloads) {
      return reply.code(410).send({ error: 'Limite de téléchargements atteinte' })
    }

    return {
      token: share.token,
      label: share.label,
      filename: share.file.originalName,
      mimeType: share.file.mimeType,
      size: share.file.size.toString(),
      expiresAt: share.expiresAt,
      hasPassword: !!share.password,
      downloads: share.downloads,
      maxDownloads: share.maxDownloads
    }
  })

  // POST /api/shares/:token/download - Télécharger (avec vérif password si besoin)
  app.post<{
    Params: { token: string }
    Body: { password?: string }
  }>('/:token/download', async (req, reply) => {
    const share = await prisma.share.findUnique({
      where: { token: req.params.token },
      include: { file: true }
    })
    if (!share) return reply.code(404).send({ error: 'Lien invalide' })

    if (share.expiresAt && share.expiresAt < new Date()) {
      return reply.code(410).send({ error: 'Ce lien a expiré' })
    }
    if (share.maxDownloads && share.downloads >= share.maxDownloads) {
      return reply.code(410).send({ error: 'Limite de téléchargements atteinte' })
    }

    if (share.password) {
      const ok = await bcrypt.compare(req.body?.password || '', share.password)
      if (!ok) return reply.code(401).send({ error: 'Mot de passe incorrect' })
    }

    const fileExists = await fs.pathExists(share.file.path)
    if (!fileExists) return reply.code(404).send({ error: 'Fichier manquant sur le serveur' })

    await prisma.share.update({
      where: { id: share.id },
      data: { downloads: { increment: 1 } }
    })
    await prisma.file.update({
      where: { id: share.fileId },
      data: { downloads: { increment: 1 } }
    })

    req.log.info({ token: req.params.token, filename: share.file.originalName }, 'File downloaded')
    const stream = fs.createReadStream(share.file.path)
    reply.header('Content-Type', share.file.mimeType)
    reply.header(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(share.file.originalName)}"`
    )
    reply.header('Content-Length', share.file.size.toString())
    return reply.send(stream)
  })

  // POST /api/shares/send-email — envoyer un ou plusieurs liens par email (authentifié)
  app.post<{
    Body: { to: string; tokens: string[]; lang?: string }
  }>('/send-email', { onRequest: [app.authenticate] }, async (req: any, reply) => {
    const { to, tokens, lang = 'fr' } = req.body
    const isEn = lang === 'en'
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return reply.code(400).send({ code: 'EMAIL_INVALID' })
    }
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return reply.code(400).send({ code: 'NO_TOKENS' })
    }

    const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } })
    if (!settings?.smtpHost || !settings?.smtpFrom) {
      return reply.code(503).send({ code: 'SMTP_NOT_CONFIGURED' })
    }

    const baseUrl = (settings.siteUrl || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '')

    // Récupérer les infos des partages
    const shares = await prisma.share.findMany({
      where: { token: { in: tokens } },
      include: { file: true }
    })
    if (shares.length === 0) return reply.code(404).send({ code: 'SHARES_NOT_FOUND' })

    // Corps du mail
    const appName = settings.appName || 'Filyo'
    const filesHtml = shares.map(s => {
      const url = `${baseUrl}/s/${s.token}`
      const expiry = s.expiresAt
        ? (isEn
            ? `Expires ${new Date(s.expiresAt).toLocaleDateString('en-GB')}`
            : `Expire le ${new Date(s.expiresAt).toLocaleDateString('fr-FR')}`)
        : (isEn ? 'No expiry' : 'Sans expiration')
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #2a2d4a">
            <a href="${url}" style="color:#7a8dff;font-weight:600;text-decoration:none">${s.file.originalName}</a><br>
            <span style="font-size:12px;color:#666;font-family:monospace">${url}</span><br>
            <span style="font-size:11px;color:#888">${expiry}</span>
          </td>
        </tr>`
    }).join('')
    const filesText = shares.map(s =>
      `- ${s.file.originalName}\n  ${baseUrl}/s/${s.token}`
    ).join('\n')

    const subjectSingle = isEn
      ? `Share: ${shares[0].file.originalName}`
      : `Partage\u00a0: ${shares[0].file.originalName}`
    const subjectMulti = isEn
      ? `${shares.length} files shared with you`
      : `${shares.length} fichiers partag\u00e9s avec vous`
    const introSingle = isEn ? 'A file has been shared with you.' : 'Un fichier a \u00e9t\u00e9 partag\u00e9 avec vous.'
    const introMulti = isEn
      ? `${shares.length} files have been shared with you.`
      : `${shares.length} fichiers ont \u00e9t\u00e9 partag\u00e9s avec vous.`
    const greetingText = isEn
      ? `Hello,\n\nHere ${shares.length === 1 ? 'is your share link' : 'are your share links'}:\n\n${filesText}\n\nSent via ${appName}.`
      : `Bonjour,\n\nVoici ${shares.length === 1 ? 'votre lien de partage' : 'vos liens de partage'}\u00a0:\n\n${filesText}\n\nEnvoy\u00e9 via ${appName}.`
    const footerText = isEn ? `Sent via ${appName}` : `Envoy\u00e9 via ${appName}`

    const smtpPort = settings.smtpPort ?? 587
    // Port 465 = SSL/TLS direct ; port 587/25 = STARTTLS (secure doit être false)
    const smtpSecure = smtpPort === 465 ? true : false
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      requireTLS: smtpPort === 587, // force STARTTLS sur 587
      auth: settings.smtpUser ? { user: settings.smtpUser, pass: settings.smtpPass ?? '' } : undefined
    })

    try {
      await transporter.sendMail({
        from: `"${appName}" <${settings.smtpFrom}>`,
        to,
        subject: `[${appName}] ${shares.length === 1 ? subjectSingle : subjectMulti}`,
        text: greetingText,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;background:#0d0e1a;color:#e8eaf6;padding:32px 24px;border-radius:16px">
            <h2 style="margin:0 0 6px;color:#7a8dff;font-size:20px">${appName}</h2>
            <p style="color:#aaa;font-size:13px;margin:0 0 24px">
              ${shares.length === 1 ? introSingle : introMulti}
            </p>
            <table style="width:100%;border-collapse:collapse;background:#13152a;border-radius:12px;overflow:hidden">
              ${filesHtml}
            </table>
            <p style="font-size:11px;color:#555;margin-top:24px;text-align:center">${footerText}</p>
          </div>`
      })
    } catch (err: any) {
      req.log.error({ err: err.message }, 'SMTP sendMail failed')
      return reply.code(502).send({ code: 'EMAIL_SEND_FAILED', detail: err.message })
    }

    req.log.info({ to, count: tokens.length }, 'Share email sent')
    return { success: true }
  })
}
