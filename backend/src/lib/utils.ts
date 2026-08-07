const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Vérifie qu'une adresse e-mail est syntaxiquement valide.
 * @param email - La chaîne à valider.
 * @returns `true` si l'adresse est valide.
 */
export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim())
}

/**
 * Tronque un token pour un affichage sûr dans les logs (8 premiers caractères + ellipse).
 * @param token - Le token complet à masquer.
 * @returns Le token tronqué, ex. "a1b2c3d4…".
 */
export function maskToken(token: string): string {
  return token.substring(0, 8) + '…'
}

/**
 * Masque une adresse e-mail pour un affichage sûr dans les logs (3 premiers caractères + domaine).
 * @param email - L'adresse complète à masquer.
 * @returns L'adresse masquée, ex. "mou***@yahoo.fr".
 */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@')
  if (!domain) return '***'
  return user.substring(0, 3) + '***@' + domain
}
