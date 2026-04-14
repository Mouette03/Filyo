import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import fs from 'fs-extra'
import { nanoid } from 'nanoid'
import { prisma } from '../lib/prisma'
import { getAppSettings } from '../lib/appSettings'
import { createSmtpTransport } from '../lib/smtp'
import { t, escapeHtml } from '../lib/i18n'
import { createDlToken, consumeDlToken } from '../lib/dlTokens'

/** Retourne le nom d'affichage d'un fichier en tenant compte de hideFilenames. */
function getDisplayName(originalName: string, hideFilenames: boolean, lang = 'fr'): string {
  if (!hideFilenames) return originalName
  const ext = originalName.includes('.') ? originalName.split('.').pop() : ''
  const base = t(lang, 'email.share.hiddenFile')
  return ext ? `${base}.${ext}` : base
}

/**
 * Registers share-related routes: public share info, password-protected download,
 * and authenticated email sending with optional batch support.
 */
export async function shareRoutes(app: FastifyInstance) {
  // GET /api/shares/:token/info - Info publique (sans téléchargement)
  app.get<{ Params: { token: string } }>('/:token/info', async (req, reply) => {
    const share = await prisma.share.findUnique({
      where: { token: req.params.token },
      include: { file: { include: { shares: true } } }
    })
    if (!share) return reply.code(404).send({ code: 'SHARE_NOT_FOUND' })

    if (share.expiresAt && share.expiresAt < new Date()) {
      return reply.code(410).send({ code: 'SHARE_EXPIRED' })
    }
    if (share.maxDownloads && share.downloads >= share.maxDownloads) {
      return reply.code(410).send({ code: 'SHARE_LIMIT_REACHED' })
    }

    // Récupère tous les fichiers du lot si batchToken existe
    let batchFiles: any[] = []
    if (share.file.batchToken) {
      const allInBatch = await prisma.file.findMany({
        where: { batchToken: share.file.batchToken },
        include: {
          shares: {
            orderBy: { createdAt: 'asc' },
            take: 1
          }
        },
        orderBy: { uploadedAt: 'asc' }
      })
      batchFiles = allInBatch
        .filter((f: any) => f.shares.length > 0 && f.shares[0]?.token)
        .map((f: any) => {
          const sh = f.shares[0]
          return {
            shareToken: sh.token,
            fileId: f.id,
            filename: getDisplayName(f.originalName, f.hideFilenames),
            mimeType: f.mimeType,
            size: f.size.toString(),
            downloads: sh.downloads,
            maxDownloads: sh.maxDownloads
          }
        })
    }

    const displayName = getDisplayName(share.file.originalName, share.file.hideFilenames)

    return {
      token: share.token,
      label: share.label,
      filename: displayName,
      mimeType: share.file.mimeType,
      size: share.file.size.toString(),
      expiresAt: share.expiresAt,
      hasPassword: !!share.password,
      downloads: share.downloads,
      maxDownloads: share.maxDownloads,
      hideFilenames: share.file.hideFilenames,
      batchToken: share.file.batchToken ?? null,
      batchFiles: batchFiles.length > 1 ? batchFiles : null
    }
  })

  // POST /api/shares/:token/dl-token — vérifie le mot de passe, retourne un token de téléchargement court-vivant
  app.post<{ Params: { token: string }; Body: { password?: string } }>('/:token/dl-token', {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: '1 minute',
        keyGenerator: (req) => `${req.ip}:${(req.params as any).token}`,
      },
    },
  }, async (req, reply) => {
    const share = await prisma.share.findUnique({
      where: { token: req.params.token },
      include: { file: true }
    })
    if (!share) return reply.code(404).send({ code: 'SHARE_NOT_FOUND' })
    if (share.expiresAt && share.expiresAt < new Date()) return reply.code(410).send({ code: 'SHARE_EXPIRED' })
    if (share.maxDownloads && share.downloads >= share.maxDownloads) return reply.code(410).send({ code: 'SHARE_LIMIT_REACHED' })

    if (share.password) {
      const ok = await bcrypt.compare(req.body?.password || '', share.password)
      if (!ok) {
        req.log.warn(
          { tokenPrefix: req.params.token.substring(0, 8) + '…', ipMasked: req.ip.replace(/(\.(\d+))$/, '.***').replace(/(:([0-9a-f]+))$/i, ':****') },
          'Share dl-token: wrong password attempt'
        )
        return reply.code(401).send({ code: 'WRONG_PASSWORD' })
      }
    }

    const fileExists = await fs.pathExists(share.file.path)
    if (!fileExists) return reply.code(404).send({ code: 'FILE_MISSING' })

    const dlToken = createDlToken({
      path: share.file.path,
      filename: share.file.originalName,
      mimeType: share.file.mimeType,
      size: share.file.size,
      onDownload: async () => {
        await prisma.$transaction([
          prisma.share.update({ where: { id: share.id }, data: { downloads: { increment: 1 } } }),
          prisma.file.update({ where: { id: share.fileId }, data: { downloads: { increment: 1 } } })
        ])
        req.log.info({ token: req.params.token, filename: share.file.originalName }, 'File downloaded via dl-token')
      }
    })

    return { dlToken }
  })

  // GET /api/shares/dl/:dlToken — streaming direct via navigateur (pas d'auth, token prouve l'autorisation)
  app.get<{ Params: { dlToken: string } }>('/dl/:dlToken', async (req, reply) => {
    const entry = consumeDlToken(req.params.dlToken)
    if (!entry) return reply.code(410).send({ code: 'DL_TOKEN_INVALID' })

    const fileExists = await fs.pathExists(entry.path)
    if (!fileExists) return reply.code(404).send({ code: 'FILE_MISSING' })

    if (entry.onDownload) await entry.onDownload()

    const stream = fs.createReadStream(entry.path)
    reply.header('Content-Type', entry.mimeType)
    reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(entry.filename)}"`)
    reply.header('Content-Length', entry.size.toString())
    return reply.send(stream)
  })

  // POST /api/shares/:token/download - Télécharger (avec vérif password si besoin)
  app.post<{
    Params: { token: string }
    Body: { password?: string }
  }>('/:token/download', {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: '1 minute',
        keyGenerator: (req) => `${req.ip}:${(req.params as any).token}`,
      },
    },
  }, async (req, reply) => {
    const share = await prisma.share.findUnique({
      where: { token: req.params.token },
      include: { file: true }
    })
    if (!share) return reply.code(404).send({ code: 'SHARE_NOT_FOUND' })

    if (share.expiresAt && share.expiresAt < new Date()) {
      return reply.code(410).send({ code: 'SHARE_EXPIRED' })
    }
    if (share.maxDownloads && share.downloads >= share.maxDownloads) {
      return reply.code(410).send({ code: 'SHARE_LIMIT_REACHED' })
    }

    if (share.password) {
      const ok = await bcrypt.compare(req.body?.password || '', share.password)
      if (!ok) {
        req.log.warn(
          {
            tokenPrefix: req.params.token.substring(0, 8) + '…',
            ipMasked: req.ip.replace(/(\.\d+)$/, '.***').replace(/(:[0-9a-f]+)$/i, ':****'),
          },
          'Share download: wrong password attempt'
        )
        return reply.code(401).send({ code: 'WRONG_PASSWORD' })
      }
    }

    const fileExists = await fs.pathExists(share.file.path)
    if (!fileExists) return reply.code(404).send({ code: 'FILE_MISSING' })

    await prisma.$transaction([
      prisma.share.update({
        where: { id: share.id },
        data: { downloads: { increment: 1 } }
      }),
      prisma.file.update({
        where: { id: share.fileId },
        data: { downloads: { increment: 1 } }
      })
    ])

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
  }>('/send-email', {
    onRequest: [app.authenticate],
    config: {
      rateLimit: {
        hook: 'preHandler',
        max: 10,
        timeWindow: '10 minutes',
        keyGenerator: (req) => req.user?.id ?? req.ip,
      },
    },
  }, async (req, reply) => {
    const { to, tokens, lang = 'fr' } = req.body
    const MAX_RECIPIENTS = 10
    const rawAddresses: string[] = (to || '').split(',').map((s: string) => s.trim()).filter(Boolean)
    const addresses: string[] = [...new Set(rawAddresses)]
    if (addresses.length === 0 || addresses.some((a: string) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a))) {
      return reply.code(400).send({ code: 'EMAIL_INVALID' })
    }
    if (addresses.length > MAX_RECIPIENTS) {
      return reply.code(400).send({ code: 'TOO_MANY_RECIPIENTS', max: MAX_RECIPIENTS })
    }
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return reply.code(400).send({ code: 'NO_TOKENS' })
    }

    const settings = await getAppSettings()
    if (!settings.smtpHost || !settings.smtpFrom) {
      return reply.code(503).send({ code: 'SMTP_NOT_CONFIGURED' })
    }

    const baseUrl = (settings.siteUrl || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '')

    // Récupérer les infos des partages
    let shares = await prisma.share.findMany({
      where: { token: { in: tokens } },
      include: { file: true }
    })
    if (shares.length === 0) return reply.code(404).send({ code: 'SHARES_NOT_FOUND' })

    // Si 1 seul token envoyé mais que son fichier appartient à un lot, étendre au lot complet
    if (shares.length === 1 && shares[0].file.batchToken) {
      const batchFiles = await prisma.file.findMany({
        where: { batchToken: shares[0].file.batchToken },
        include: { shares: { orderBy: { createdAt: 'asc' }, take: 1 } },
        orderBy: { uploadedAt: 'asc' }
      })
      // Récupérer tous les partages du lot
      const batchShareTokens = batchFiles
        .filter((f: any) => f.shares.length > 0)
        .map((f: any) => f.shares[0].token)
      if (batchShareTokens.length > 1) {
        shares = await prisma.share.findMany({
          where: { token: { in: batchShareTokens } },
          include: { file: true },
          orderBy: { file: { uploadedAt: 'asc' } }
        })
      }
    }

    // Détecter si tous les fichiers appartiennent au même lot → 1 seul lien
    const batchTokens = new Set(shares.map((s: any) => s.file.batchToken).filter(Boolean))
    const isSingleBatch = batchTokens.size === 1 && shares.length > 1

    const appName = settings.appName || 'Filyo'
    const safeAppName = escapeHtml(appName)

    let filesHtml: string
    let filesText: string

    if (isSingleBatch) {
      // Un seul lien pour tout le lot, affiche la liste des noms dans l'email
      const batchUrl = `${baseUrl}/s/${shares[0].token}`
      const fileListHtml = shares.map((s: any) => {
        return `<li style="color:#ccc;font-size:13px;padding:2px 0">${escapeHtml(getDisplayName(s.file.originalName, s.file.hideFilenames, lang))}</li>`
      }).join('')
      const fileListText = shares.map((s: any) => {
        return s.file.hideFilenames ? `- ${t(lang, 'email.share.hiddenName')}` : `- ${s.file.originalName}`
      }).join('\n')
      const expiry = shares[0].expiresAt
        ? t(lang, 'email.share.expiresOn', { date: new Date(shares[0].expiresAt).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR') })
        : t(lang, 'email.share.noExpiry')

      filesHtml = `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #2a2d4a">
            <ul style="margin:0 0 8px;padding-left:16px">${fileListHtml}</ul>
            <a href="${escapeHtml(encodeURI(batchUrl))}" style="color:#7a8dff;font-weight:600;text-decoration:none">${t(lang, 'email.share.downloadAll')}</a><br>
            <span style="font-size:12px;color:#666;font-family:monospace">${escapeHtml(encodeURI(batchUrl))}</span><br>
            <span style="font-size:11px;color:#888">${expiry}</span>
          </td>
        </tr>`
      filesText = t(lang, 'email.share.filesLabel') + '\n' + fileListText + `\n\n${batchUrl}`
    } else {
      filesHtml = shares.map((s: any) => {
        const url = `${baseUrl}/s/${s.token}`
        const displayName = getDisplayName(s.file.originalName, s.file.hideFilenames, lang)
        const expiry = s.expiresAt
          ? t(lang, 'email.share.expiresOn', { date: new Date(s.expiresAt).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR') })
          : t(lang, 'email.share.noExpiry')
        return `
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #2a2d4a">
              <a href="${escapeHtml(encodeURI(url))}" style="color:#7a8dff;font-weight:600;text-decoration:none">${escapeHtml(displayName)}</a><br>
              <span style="font-size:12px;color:#666;font-family:monospace">${escapeHtml(encodeURI(url))}</span><br>
              <span style="font-size:11px;color:#888">${expiry}</span>
            </td>
          </tr>`
      }).join('')
      filesText = shares.map((s: any) => {
        const displayName = s.file.hideFilenames ? t(lang, 'email.share.hiddenName') : s.file.originalName
        return `- ${displayName}\n  ${baseUrl}/s/${s.token}`
      }).join('\n')
    }

    const firstDisplayName = shares[0].file.hideFilenames
      ? t(lang, 'email.share.hiddenNameShort')
      : shares[0].file.originalName

    const subject = shares.length === 1
      ? t(lang, 'email.share.subjectSingle', { name: firstDisplayName })
      : t(lang, 'email.share.subjectMulti', { count: shares.length })
    const intro = shares.length === 1
      ? t(lang, 'email.share.introSingle')
      : t(lang, 'email.share.introMulti', { count: shares.length })
    const linkLabel = t(lang, shares.length === 1 ? 'email.share.linkLabelSingle' : 'email.share.linkLabelMulti')
    const greetingText = t(lang, 'email.share.textBody', { linkLabel, files: filesText, appName })

    req.log.info({ host: settings.smtpHost, port: settings.smtpPort ?? 587, secure: (settings.smtpPort ?? 587) === 465 }, 'SMTP: tentative envoi')
    const transporter = createSmtpTransport(settings)

    try {
      await transporter.sendMail({
        from: `"${appName}" <${settings.smtpFrom}>`,
        to: 'undisclosed-recipients:;',
        bcc: addresses.join(', '),
        subject: `[${appName}] ${subject}`,
        text: greetingText,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;background:#0d0e1a;color:#e8eaf6;padding:32px 24px;border-radius:16px">
            <h2 style="margin:0 0 6px;color:#7a8dff;font-size:20px">${safeAppName}</h2>
            <p style="color:#aaa;font-size:13px;margin:0 0 24px">
              ${intro}
            </p>
            <table style="width:100%;border-collapse:collapse;background:#13152a;border-radius:12px;overflow:hidden">
              ${filesHtml}
            </table>
            <p style="font-size:11px;color:#555;margin-top:24px;text-align:center">${t(lang, 'email.share.footer', { appName: safeAppName })}</p>
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
