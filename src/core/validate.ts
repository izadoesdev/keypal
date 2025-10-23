import { timingSafeEqual } from 'node:crypto'
import { hashKey, type HashAlgorithm } from './hash'

export function validateKey(
    key: string,
    storedHash: string,
    algorithm: HashAlgorithm = 'sha256'
): boolean {
    const computedHash = hashKey(key, algorithm)

    if (computedHash.length !== storedHash.length) {
        return false
    }

    return timingSafeEqual(
        Buffer.from(computedHash),
        Buffer.from(storedHash)
    )
}
