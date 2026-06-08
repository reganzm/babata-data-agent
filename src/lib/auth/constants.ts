export const SESSION_COOKIE = 'babata_session'

export function resourceIdForUser(userId: string): string {
  return `babata-user-${userId}`
}
