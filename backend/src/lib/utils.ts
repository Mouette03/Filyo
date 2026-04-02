const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Vérifie qu'une adresse e-mail est syntaxiquement valide.
 * @param email - La chaîne à valider.
 * @returns `true` si l'adresse est valide.
 */
export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim())
}
