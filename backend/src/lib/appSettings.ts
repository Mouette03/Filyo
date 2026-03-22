import { prisma } from './prisma'

/**
 * Retourne les paramètres de l'application, en créant le singleton s'il n'existe pas encore.
 * À utiliser à la place de prisma.appSettings.findUnique() pour éviter les null inattendus.
 */
export async function getAppSettings() {
  return prisma.appSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton', appName: 'Filyo' }
  })
}
