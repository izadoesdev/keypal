/**
 * Check if a key has expired based on its metadata
 */
export function isExpired(expiresAt: string | null | undefined): boolean {
    if (!expiresAt) return false

    try {
        const expirationDate = new Date(expiresAt)
        return expirationDate < new Date()
    } catch {
        return false
    }
}

/**
 * Get the number of milliseconds until expiration
 * Returns null if no expiration or already expired
 */
export function getExpirationTime(expiresAt: string | null | undefined): number | null {
    if (!expiresAt) return null

    try {
        const expirationDate = new Date(expiresAt)
        const now = new Date()
        const diff = expirationDate.getTime() - now.getTime()
        return diff > 0 ? diff : null
    } catch {
        return null
    }
}

