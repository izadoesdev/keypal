import { describe, it, expect } from 'vitest'
import { validateKey } from './validate'
import { hashKey } from './hash'

describe('validateKey', () => {
    it('should validate a correct key', () => {
        const key = 'test-key-123'
        const storedHash = hashKey(key)

        const isValid = validateKey(key, storedHash)
        expect(isValid).toBe(true)
    })

    it('should reject an incorrect key', () => {
        const key = 'test-key-123'
        const wrongKey = 'test-key-456'
        const storedHash = hashKey(key)

        const isValid = validateKey(wrongKey, storedHash)
        expect(isValid).toBe(false)
    })

    it('should validate with sha256 algorithm', () => {
        const key = 'test-key-123'
        const storedHash = hashKey(key, 'sha256')

        const isValid = validateKey(key, storedHash, 'sha256')
        expect(isValid).toBe(true)
    })

    it('should validate with sha512 algorithm', () => {
        const key = 'test-key-123'
        const storedHash = hashKey(key, 'sha512')

        const isValid = validateKey(key, storedHash, 'sha512')
        expect(isValid).toBe(true)
    })

    it('should reject when algorithm mismatch', () => {
        const key = 'test-key-123'
        const storedHash = hashKey(key, 'sha256')

        const isValid = validateKey(key, storedHash, 'sha512')
        expect(isValid).toBe(false)
    })

    it('should handle empty string', () => {
        const key = ''
        const storedHash = hashKey(key)

        const isValid = validateKey(key, storedHash)
        expect(isValid).toBe(true)
    })

    it('should handle very long keys', () => {
        const key = 'a'.repeat(10000)
        const storedHash = hashKey(key)

        const isValid = validateKey(key, storedHash)
        expect(isValid).toBe(true)
    })

    it('should handle special characters', () => {
        const key = '!@#$%^&*()_+-=[]{}|;:,.<>?'
        const storedHash = hashKey(key)

        const isValid = validateKey(key, storedHash)
        expect(isValid).toBe(true)
    })

    it('should handle unicode characters', () => {
        const key = '你好世界 🌍'
        const storedHash = hashKey(key)

        const isValid = validateKey(key, storedHash)
        expect(isValid).toBe(true)
    })

    it('should reject when hash length is different', () => {
        const key = 'test-key'
        const wrongHash = 'short'

        const isValid = validateKey(key, wrongHash)
        expect(isValid).toBe(false)
    })

    it('should reject invalid hash format', () => {
        const key = 'test-key'
        const invalidHash = 'not-a-valid-hex-hash-!!@#'

        const isValid = validateKey(key, invalidHash)
        expect(isValid).toBe(false)
    })

    it('should handle single character change in key', () => {
        const key1 = 'test-key-123'
        const key2 = 'test-key-124'
        const storedHash = hashKey(key1)

        const isValid = validateKey(key2, storedHash)
        expect(isValid).toBe(false)
    })

    it('should handle single character change in hash', () => {
        const key = 'test-key-123'
        const correctHash = hashKey(key)
        const wrongHash = correctHash.substring(0, 63) + 'f' // Change last character

        const isValid = validateKey(key, wrongHash)
        expect(isValid).toBe(false)
    })
})

