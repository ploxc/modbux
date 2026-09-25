import { createHash, randomBytes } from 'node:crypto'
import { McpToken } from '@shared'

/** A token of 256 random bits, and the SHA-256 digest the settings keep of it. */
export const createMcpToken = (): McpToken => {
  const token = `mbx_${randomBytes(32).toString('base64url')}`
  return { token, tokenHash: createHash('sha256').update(token).digest('hex') }
}
