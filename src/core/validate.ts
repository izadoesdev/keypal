import { timingSafeEqual } from 'node:crypto'
import { hashKey } from './hash'

/**
 * Validate an API key against a stored hash using timing-safe comparison
 * 
 * This prevents timing attacks by using constant-time comparison
 * 
 * @param key The API key to validate
 * @param storedHash The stored hash to compare against
 * @param algorithm The hashing algorithm used (default: 'sha256')
 * @returns True if the key matches the hash, false otherwise
 */
export function validateKey(
    key: string,
    storedHash: string,
    algorithm: 'sha256' | 'sha512' = 'sha256'
): boolean {
    // Hash the provided key
    const keyHash = hashKey(key, algorithm)

    // Get buffer lengths
    const keyHashBuffer = Buffer.from(keyHash, 'hex')
    const storedHashBuffer = Buffer.from(storedHash, 'hex')

    // If lengths don't match, it's definitely not valid
    if (keyHashBuffer.length !== storedHashBuffer.length) {
        return false
    }

    // Use timing-safe comparison
    return timingSafeEqual(keyHashBuffer, storedHashBuffer)
}

