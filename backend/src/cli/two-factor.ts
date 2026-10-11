/**
 * Commande de secours 2FA, à lancer dans le conteneur quand plus aucun admin ne peut se connecter
 * (téléphone et codes de secours perdus).
 *
 *   docker exec -it -u node filyo node dist/cli/two-factor.js list
 *   docker exec -it -u node filyo node dist/cli/two-factor.js reset admin@example.com
 *   docker exec -it -u node filyo node dist/cli/two-factor.js disable-policy
 *
 * Ne lit ni n'affiche aucun secret. La réinitialisation est identique à celle de la page Utilisateurs.
 */
import { createInterface } from 'node:readline/promises'

const USAGE = `Filyo — two-factor authentication recovery

Usage:
  node dist/cli/two-factor.js list
      List accounts with their role, status and 2FA state, and the 2FA policy.

  node dist/cli/two-factor.js reset <email> [--yes]
      Disable 2FA for this account: deletes its TOTP secret, recovery codes and
      pending logins, and signs out all its sessions. The password is unchanged.
      If 2FA is mandatory, the user will have to set it up again after logging in.

  node dist/cli/two-factor.js disable-policy [--yes]
      Make 2FA optional again (Settings → "Two-factor authentication required").

Options:
  --yes          Do not ask for confirmation (required without an interactive terminal).
  --allow-root   Allow running as root with SQLite (not recommended, see below).
  -h, --help     Show this help.

In Docker, run it as the application user so SQLite files keep the right owner:
  docker exec -it -u node filyo node dist/cli/two-factor.js list
`

type Args = { command?: string; email?: string; yes: boolean; allowRoot: boolean; help: boolean }

function parseArgs(argv: string[]): Args {
  const args: Args = { yes: false, allowRoot: false, help: false }
  const positional: string[] = []
  for (const a of argv) {
    if (a === '--yes' || a === '-y') args.yes = true
    else if (a === '--allow-root') args.allowRoot = true
    else if (a === '-h' || a === '--help') args.help = true
    else if (a.startsWith('-')) throw new UsageError(`Unknown option: ${a}`)
    else positional.push(a)
  }
  ;[args.command, args.email] = positional
  if (positional.length > 2) throw new UsageError('Too many arguments.')
  return args
}

class UsageError extends Error {}

/** Même logique que entrypoint.sh, pour viser la même base que l'application. */
function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const { DB_HOST, DB_USER, DB_PASSWORD, DB_PORT, DB_NAME } = process.env
  if (DB_HOST) {
    return `mysql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT || '3306'}/${DB_NAME}?connection_limit=10&connect_timeout=10&pool_timeout=20&socket_timeout=60`
  }
  return 'file:/data/filyo.db'
}

async function confirm(question: string, yes: boolean): Promise<boolean> {
  if (yes) return true
  if (!process.stdin.isTTY) {
    throw new UsageError('No interactive terminal: add --yes to confirm (or use docker exec -it).')
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await rl.question(`${question} Type "yes" to confirm: `)
    return answer.trim().toLowerCase() === 'yes'
  } finally {
    rl.close()
  }
}

async function main(): Promise<number> {
  let args: Args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (err) {
    console.error(`${(err as Error).message}\n\n${USAGE}`)
    return 2
  }
  if (args.help || !args.command) {
    console.log(USAGE)
    return args.help ? 0 : 2
  }
  if (!['list', 'reset', 'disable-policy'].includes(args.command)) {
    console.error(`Unknown command: ${args.command}\n\n${USAGE}`)
    return 2
  }
  if (args.command === 'reset' && !args.email) {
    console.error(`Missing email.\n\n${USAGE}`)
    return 2
  }

  process.env.DATABASE_URL = resolveDatabaseUrl()
  const isSqlite = process.env.DATABASE_URL.startsWith('file:')
  // En root, SQLite peut créer des fichiers -wal/-shm appartenant à root : l'application
  // (utilisateur node) ne pourrait plus écrire dans la base ensuite.
  if (isSqlite && process.getuid?.() === 0 && !args.allowRoot) {
    console.error('Refusing to run as root with SQLite: database files could end up owned by root.\n' +
      'Run it as the application user:  docker exec -it -u node filyo node dist/cli/two-factor.js ...\n' +
      '(or add --allow-root if you know what you are doing)')
    return 1
  }

  // Import après DATABASE_URL : le client Prisma lit la variable au chargement.
  const { prisma } = await import('../lib/prisma.js')
  const { resetUserTwoFactor } = await import('../lib/twoFactorReset.js')
  try {
    if (args.command === 'list') {
      const [users, settings] = await Promise.all([
        prisma.user.findMany({
          orderBy: [{ role: 'asc' }, { email: 'asc' }],
          select: { email: true, name: true, role: true, active: true, twoFactorEnabled: true }
        }),
        prisma.appSettings.findUnique({ where: { id: 'singleton' }, select: { twoFactorRequired: true } })
      ])
      console.log(`2FA policy: ${settings?.twoFactorRequired ? 'REQUIRED' : 'optional'}\n`)
      if (!users.length) { console.log('No accounts.'); return 0 }
      console.table(users.map(u => ({
        email: u.email, name: u.name, role: u.role,
        active: u.active ? 'yes' : 'no', '2FA': u.twoFactorEnabled ? 'enabled' : 'disabled'
      })))
      return 0
    }

    if (args.command === 'reset') {
      const email = args.email!
      let user = await prisma.user.findUnique({
        where: { email }, select: { id: true, email: true, role: true, twoFactorEnabled: true }
      })
      if (!user) {
        // SQLite compare les e-mails en respectant la casse : on tolère une différence de majuscules.
        const all = await prisma.user.findMany({ select: { id: true, email: true, role: true, twoFactorEnabled: true } })
        const matches = all.filter(u => u.email.toLowerCase() === email.toLowerCase())
        if (matches.length === 1) user = matches[0]
      }
      if (!user) {
        console.error(`No account with email "${email}". Use "list" to see accounts.`)
        return 1
      }
      if (!user.twoFactorEnabled) {
        console.log(`2FA is not enabled for ${user.email}: nothing to do.`)
        return 0
      }
      if (!await confirm(`Reset 2FA for ${user.email} (${user.role})? All their sessions will be signed out.`, args.yes)) {
        console.log('Cancelled.')
        return 1
      }
      await resetUserTwoFactor(prisma, user.id)
      console.log(`2FA reset for ${user.email}. They can now log in with their password` +
        ' (and will have to set up 2FA again if it is mandatory).')
      return 0
    }

    // disable-policy
    const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' }, select: { twoFactorRequired: true } })
    if (!settings?.twoFactorRequired) {
      console.log('2FA is already optional: nothing to do.')
      return 0
    }
    if (!await confirm('Make 2FA optional for all accounts?', args.yes)) {
      console.log('Cancelled.')
      return 1
    }
    await prisma.appSettings.update({ where: { id: 'singleton' }, data: { twoFactorRequired: false } })
    console.log('2FA is now optional. Accounts that already use it keep it.')
    return 0
  } catch (err) {
    if (err instanceof UsageError) { console.error(err.message); return 2 }
    console.error('Error:', (err as Error).message)
    return 1
  } finally {
    await prisma.$disconnect()
  }
}

process.exitCode = await main()
