export interface KeyExtractionOptions {
    headerNames?: string[]
    extractBearer?: boolean
}

const DEFAULT_HEADER_NAMES = ['authorization', 'x-api-key']

export function extractKeyFromHeaders(
    headers: Record<string, string | undefined> | Headers,
    options: KeyExtractionOptions = {}
): string | null {
    const {
        headerNames = DEFAULT_HEADER_NAMES,
        extractBearer = true,
    } = options

    const headersToCheck = headerNames ?? DEFAULT_HEADER_NAMES

    const getHeader = (name: string): string | null => {
        if (headers instanceof Headers) {
            return headers.get(name)
        }
        const lowerName = name.toLowerCase()
        for (const key in headers) {
            if (key.toLowerCase() === lowerName) {
                return headers[key] ?? null
            }
        }
        return null
    }

    for (const headerName of headersToCheck) {
        const value = getHeader(headerName)
        if (!value) continue

        const trimmed = value.trim()
        if (!trimmed) continue

        const lowerValue = trimmed.toLowerCase()

        if (lowerValue.startsWith('bearer')) {
            if (extractBearer) {
                if (lowerValue.length === 6) {
                    continue
                }
                if (lowerValue[6] === ' ') {
                    const key = trimmed.slice(7).trim()
                    if (!key) continue
                    return key
                }
                continue
            } else {
                return trimmed
            }
        } else {
            return trimmed
        }
    }

    return null
}

export function hasApiKey(
    headers: Record<string, string | undefined> | Headers,
    options: KeyExtractionOptions = {}
): boolean {
    return extractKeyFromHeaders(headers, options) !== null
}

