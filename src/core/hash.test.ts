import { describe, it, expect } from 'vitest'
import { hashKey } from './hash'

describe('hashKey', () => {
    it('should hash a key with default algorithm (sha256)', () => {
        const key = 'test-key-123'
        const hash = hashKey(key)

        expect(hash).toBeDefined()
        expect(typeof hash).toBe('string')
        expect(hash.length).toBe(64) // SHA-256 produces 64 hex characters
    })

    it('should hash a key with sha256 explicitly', () => {
        const key = 'test-key-123'
        const hash = hashKey(key, 'sha256')

        expect(hash).toBeDefined()
        expect(hash.length).toBe(64)
    })

    it('should hash a key with sha512', () => {
        const key = 'test-key-123'
        const hash = hashKey(key, 'sha512')

        expect(hash).toBeDefined()
        expect(hash.length).toBe(128) // SHA-512 produces 128 hex characters
    })

    it('should produce consistent hashes for same input', () => {
        const key = 'test-key-123'
        const hash1 = hashKey(key)
        const hash2 = hashKey(key)

        expect(hash1).toBe(hash2)
    })

    it('should produce different hashes for different inputs', () => {
        const hash1 = hashKey('key1')
        const hash2 = hashKey('key2')

        expect(hash1).not.toBe(hash2)
    })

    it('should handle empty string', () => {
        const hash = hashKey('')
        expect(hash).toBeDefined()
        expect(hash.length).toBe(64)
    })

    it('should handle very long keys', () => {
        const longKey = 'a'.repeat(10000)
        const hash = hashKey(longKey)
        expect(hash).toBeDefined()
        expect(hash.length).toBe(64)
    })

    it('should handle special characters', () => {
        const specialKey = '!@#$%^&*()_+-=[]{}|;:,.<>?'
        const hash = hashKey(specialKey)
        expect(hash).toBeDefined()
        expect(hash.length).toBe(64)
    })

    it('should handle unicode characters', () => {
        const unicodeKey = '你好世界 🌍'
        const hash = hashKey(unicodeKey)
        expect(hash).toBeDefined()
        expect(hash.length).toBe(64)
    })

    it('should produce different hashes with different algorithms', () => {
        const key = 'test-key'
        const sha256Hash = hashKey(key, 'sha256')
        const sha512Hash = hashKey(key, 'sha512')

        expect(sha256Hash).not.toBe(sha512Hash)
        expect(sha256Hash.length).toBe(64)
        expect(sha512Hash.length).toBe(128)
    })
})

