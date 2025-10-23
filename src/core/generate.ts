import { randomBytes } from 'node:crypto'

/**
 * Generate a cryptographically secure random API key
 * 
 * @param options Configuration options
 * @param options.length Length of the random portion (default: 32)
 * @param options.prefix Optional prefix to prepend (e.g., "sk_live_")
 * @returns A secure random API key string
 */
export function generateKey(options: {
    length?: number
    prefix?: string
} = {}): string {
    const { length = 32, prefix = '' } = options

    // Generate random bytes and convert to base64url
    const randomPart = randomBytes(length)
        .toString('base64url')

    return prefix ? `${prefix}${randomPart}` : randomPart
}

