import { customAlphabet } from 'nanoid'

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const nanoid = customAlphabet(alphabet, 32)

export interface GenerateKeyOptions {
    prefix?: string
    length?: number
}

export function generateKey(options: GenerateKeyOptions = {}): string {
    const { prefix = '', length = 32 } = options
    const key = nanoid(length)
    return prefix ? `${prefix}${key}` : key
}
