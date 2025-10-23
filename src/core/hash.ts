import { createHash } from 'node:crypto'

export type HashAlgorithm = 'sha256' | 'sha512'

export function hashKey(key: string, algorithm: HashAlgorithm = 'sha256'): string {
    return createHash(algorithm).update(key).digest('hex')
}
