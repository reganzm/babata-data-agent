import { createClient, type Client } from '@libsql/client'
import { BABATA_STORAGE_URL } from './constants'

let client: Client | null = null

export function getDbClient(): Client {
  if (!client) {
    client = createClient({ url: BABATA_STORAGE_URL })
  }
  return client
}
