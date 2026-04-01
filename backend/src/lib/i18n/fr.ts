/**
 * French email translation strings.
 * Each key supports `{{variable}}` interpolation via the `t()` helper.
 */
export const fr = {
  email: {
    forgotPassword: {
      subject: '[{{appName}}] Réinitialisation de votre mot de passe',
      text: "Bonjour {{name}},\n\nVous avez demandé la réinitialisation de votre mot de passe.\n\nCliquez sur ce lien (valide 1h) :\n{{resetUrl}}\n\nSi vous n'avez pas fait cette demande, ignorez cet email.\n\nEnvoyé via {{appName}}.",
      htmlSubtitle: 'Réinitialisation de mot de passe',
      htmlGreeting: 'Bonjour',
      htmlBody: 'Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous (lien valide <strong>1 heure</strong>).',
      htmlButton: 'Réinitialiser mon mot de passe',
      htmlDisclaimer: "Si vous n'avez pas demandé cette réinitialisation, ignorez cet email. Votre mot de passe ne changera pas.",
    },
    share: {
      subjectSingle: 'Partage\u00a0: {{name}}',
      subjectMulti: '{{count}} fichiers partagés avec vous',
      introSingle: 'Un fichier a été partagé avec vous.',
      introMulti: '{{count}} fichiers ont été partagés avec vous.',
      textBody: 'Bonjour,\n\nVoici {{linkLabel}}\u00a0:\n\n{{files}}\n\nEnvoyé via {{appName}}.',
      linkLabelSingle: 'votre lien de partage',
      linkLabelMulti: 'vos liens de partage',
      expiresOn: 'Expire le {{date}}',
      noExpiry: 'Sans expiration',
      hiddenName: '[nom masqué]',
      hiddenNameShort: 'un fichier',
      hiddenFile: 'fichier',
      downloadAll: 'Télécharger tous les fichiers',
      filesLabel: 'Fichiers :',
      footer: 'Envoyé via {{appName}}',
    },
    uploadRequest: {
      subject: '[{{appName}}] Demande de dépôt : {{title}}',
      text: 'Bonjour,\n\nVous êtes invité(e) à déposer des fichiers : "{{title}}".\n\n{{message}}Lien de dépôt :\n{{depositUrl}}\n\nEnvoyé via {{appName}}.',
      htmlSubtitle: 'Demande de dépôt de fichiers',
      htmlBody: 'Vous êtes invité(e) à déposer des fichiers :',
      htmlButton: 'Déposer des fichiers',
    },
  },
}
