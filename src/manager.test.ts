import { describe, it, expect, beforeEach } from 'vitest'
import { createKeys } from './manager'
import { MemoryStore } from './storage/memory'

describe('ApiKeyManager', () => {
    let keys: ReturnType<typeof createKeys>
    let storage: MemoryStore

    beforeEach(() => {
        storage = new MemoryStore()
        keys = createKeys({
            prefix: 'sk_test_',
            length: 32,
            algorithm: 'sha256',
        }, storage)
    })

    describe('key generation', () => {
        it('should generate a key with configured prefix', () => {
            const key = keys.generateKey()
            expect(key.startsWith('sk_test_')).toBe(true)
        })

        it('should generate unique keys', () => {
            const key1 = keys.generateKey()
            const key2 = keys.generateKey()
            expect(key1).not.toBe(key2)
        })

        it('should generate keys without prefix when not configured', () => {
            const managerNoPrefix = createKeys({ length: 32 })
            const key = managerNoPrefix.generateKey()
            expect(key).toBeDefined()
            expect(key.length).toBeGreaterThan(0)
        })
    })

    describe('key hashing', () => {
        it('should hash a key with configured algorithm', () => {
            const key = 'test-key-123'
            const hash = keys.hashKey(key)

            expect(hash).toBeDefined()
            expect(hash.length).toBe(64)
        })

        it('should produce consistent hashes', () => {
            const key = 'test-key-123'
            const hash1 = keys.hashKey(key)
            const hash2 = keys.hashKey(key)

            expect(hash1).toBe(hash2)
        })

        it('should use sha512 when configured', () => {
            const manager512 = createKeys({ algorithm: 'sha512' })

            const key = 'test-key-123'
            const hash = manager512.hashKey(key)

            expect(hash.length).toBe(128)
        })
    })

    describe('key validation', () => {
        it('should validate a correct key', () => {
            const key = 'test-key-123'
            const hash = keys.hashKey(key)

            const isValid = keys.validateKey(key, hash)
            expect(isValid).toBe(true)
        })

        it('should reject an incorrect key', () => {
            const key = 'test-key-123'
            const wrongKey = 'test-key-456'
            const hash = keys.hashKey(key)

            const isValid = keys.validateKey(wrongKey, hash)
            expect(isValid).toBe(false)
        })

        it('should validate with sha512 algorithm', () => {
            const manager512 = createKeys({ algorithm: 'sha512' }, storage)

            const key = 'test-key-123'
            const hash = manager512.hashKey(key)

            const isValid = manager512.validateKey(key, hash)
            expect(isValid).toBe(true)
        })
    })

    describe('verify method', () => {
        it('should verify a valid key', async () => {
            const { key } = await keys.create({ ownerId: 'user_123' })

            const result = await keys.verify(key)
            expect(result.valid).toBe(true)
            expect(result.record).toBeDefined()
            expect(result.record?.metadata.ownerId).toBe('user_123')
        })

        it('should verify with Bearer token', async () => {
            const { key } = await keys.create({ ownerId: 'user_123' })

            const result = await keys.verify(`Bearer ${key}`)
            expect(result.valid).toBe(true)
        })

        it('should reject invalid key', async () => {
            const result = await keys.verify('sk_test_invalid123')
            expect(result.valid).toBe(false)
            expect(result.error).toBeDefined()
        })

        it('should reject expired key', async () => {
            const pastDate = new Date()
            pastDate.setFullYear(pastDate.getFullYear() - 1)

            const { key } = await keys.create({
                ownerId: 'user_123',
                expiresAt: pastDate.toISOString(),
            })

            const result = await keys.verify(key)
            expect(result.valid).toBe(false)
            expect(result.error).toContain('expired')
        })
    })

    describe('creating keys', () => {
        it('should create a key with metadata', async () => {
            const { key, record } = await keys.create({
                ownerId: 'user_123',
                name: 'Test Key',
                description: 'A test API key',
            })

            expect(key).toMatch(/^sk_test_/)
            expect(record.id).toBeDefined()
            expect(record.keyHash).toBeDefined()
            expect(record.metadata.ownerId).toBe('user_123')
            expect(record.metadata.name).toBe('Test Key')
            expect(record.metadata.description).toBe('A test API key')
        })

        it('should create a key with scopes', async () => {
            const { record } = await keys.create({
                ownerId: 'user_123',
                scopes: ['read', 'write'],
            })

            expect(record.metadata.scopes).toEqual(['read', 'write'])
        })

        it('should create a key with expiration', async () => {
            const expiresAt = new Date('2025-12-31')

            const { record } = await keys.create({
                ownerId: 'user_expires',
                expiresAt: expiresAt.toISOString(),
            })

            expect(record.metadata.expiresAt).toBe(expiresAt.toISOString())
        })

        it('should automatically set createdAt timestamp', async () => {
            const { record } = await keys.create({
                ownerId: 'user_123',
            })

            expect(record.metadata.createdAt).toBeDefined()
            expect(record.metadata.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
        })
    })

    describe('listing keys', () => {
        it('should list all keys for an owner', async () => {
            await keys.create({ ownerId: 'user_123' })
            await keys.create({ ownerId: 'user_123' })

            const keyList = await keys.list('user_123')
            expect(keyList.length).toBe(2)
        })

        it('should return empty array for non-existent owner', async () => {
            const keyList = await keys.list('non_existent')
            expect(keyList).toEqual([])
        })
    })

    describe('revoking keys', () => {
        it('should revoke a key by ID', async () => {
            const { record } = await keys.create({
                ownerId: 'user_123',
            })

            await keys.revoke(record.id)

            const found = await keys.findById(record.id)
            expect(found).toBeNull()
        })

        it('should revoke all keys for an owner', async () => {
            await keys.create({ ownerId: 'user_123' })
            await keys.create({ ownerId: 'user_123' })

            await keys.revokeAll('user_123')

            const keyList = await keys.list('user_123')
            expect(keyList.length).toBe(0)
        })
    })

    describe('end-to-end workflow', () => {
        it('should create, verify, and revoke a key', async () => {
            // Create
            const { key, record } = await keys.create({
                ownerId: 'user_123',
                name: 'Production Key',
            })
            expect(key.startsWith('sk_test_')).toBe(true)

            // Verify
            const result = await keys.verify(key)
            expect(result.valid).toBe(true)
            expect(result.record?.id).toBe(record.id)

            // Revoke
            await keys.revoke(record.id)
            const afterRevoke = await keys.findById(record.id)
            expect(afterRevoke).toBeNull()
        })

        it('should handle multiple keys for the same owner', async () => {
            const { key: key1, record: record1 } = await keys.create({ ownerId: 'user_123' })
            const { key: key2, record: record2 } = await keys.create({ ownerId: 'user_123' })

            expect(record1.id).not.toBe(record2.id)

            const ownerKeys = await keys.list('user_123')
            expect(ownerKeys.length).toBe(2)

            const result1 = await keys.verify(key1)
            const result2 = await keys.verify(key2)

            expect(result1.valid).toBe(true)
            expect(result2.valid).toBe(true)
        })
    })
})
