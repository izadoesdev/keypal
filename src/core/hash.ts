import { createHash } from 'node:crypto'

/**
 * Hash an API key using the specified algorithm
 * 
 * @param key The API key to hash
 * @param algorithm The hashing algorithm to use (default: 'sha256')
 * @returns The hashed key as a hex string
 */
export function hashKey(key: string, algorithm: 'sha256' | 'sha512' = 'sha256'): string {
    return createHash(algorithm)
        .update(key)
        .digest('hex')
}

