/**
 * Construit l'URL de connexion MariaDB à partir des variables DB_*.
 * Le nom d'utilisateur et le mot de passe sont encodés (encodeURIComponent) : des caractères
 * comme @ : / # ? % ne cassent plus l'URL. prisma.mariadb.ts les décode avec decodeURIComponent.
 * Même logique que entrypoint.sh, qui appelle ce module au démarrage du conteneur.
 */
export function buildMariaDbUrl(env: NodeJS.ProcessEnv = process.env): string {
  const user = encodeURIComponent(env.DB_USER ?? '')
  const password = encodeURIComponent(env.DB_PASSWORD ?? '')
  return `mysql://${user}:${password}@${env.DB_HOST}:${env.DB_PORT || '3306'}/${env.DB_NAME ?? ''}` +
    '?connection_limit=10&connect_timeout=10&pool_timeout=20&socket_timeout=60'
}

/** URL de la base de l'application : DATABASE_URL, sinon MariaDB si DB_HOST est défini, sinon SQLite. */
export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.DATABASE_URL) return env.DATABASE_URL
  if (env.DB_HOST) return buildMariaDbUrl(env)
  return 'file:/data/filyo.db'
}

// `node dist/lib/databaseUrl.js` : affiche l'URL résolue (utilisé par entrypoint.sh)
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  process.stdout.write(resolveDatabaseUrl())
}
