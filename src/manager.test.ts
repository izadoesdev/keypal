import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createKeys } from './manager'
import { MemoryStore } from './storage/memory'
import { MemoryCache } from './core/cache'

describe('ApiKeyManager', () => {
    let keys: ReturnType<typeof createKeys>
    let storage: MemoryStore

    beforeEach(() => {
        storage = new MemoryStore()
        keys = createKeys({
            prefix: 'sk_test_',
            length: 32,
            algorithm: 'sha256',
            storage,
        })
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
            const manager512 = createKeys({ algorithm: 'sha512', storage })
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
            expect(found).not.toBeNull()
            expect(found?.metadata.revokedAt).toBeDefined()
        })

        it('should revoke all keys for an owner', async () => {
            const { key: key1 } = await keys.create({ ownerId: 'user_123' })
            const { key: key2 } = await keys.create({ ownerId: 'user_123' })

            await keys.revokeAll('user_123')

            const keyList = await keys.list('user_123')
            expect(keyList.length).toBe(2)
            expect(keyList[0]?.metadata.revokedAt).toBeDefined()
            expect(keyList[1]?.metadata.revokedAt).toBeDefined()

            const result1 = await keys.verify(key1)
            const result2 = await keys.verify(key2)
            expect(result1.valid).toBe(false)
            expect(result2.valid).toBe(false)
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
            expect(afterRevoke).not.toBeNull()
            expect(afterRevoke?.metadata.revokedAt).toBeDefined()
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

describe('ApiKeyManager - Key Extraction', () => {
    let keys: ReturnType<typeof createKeys>

    beforeEach(() => {
        keys = createKeys({ prefix: 'sk_' })
    })

    it('should extract key from Headers object', async () => {
        const { key } = await keys.create({ ownerId: 'user_1' })

        const headers = new Headers({
            'authorization': `Bearer ${key}`,
        })

        const result = await keys.verify(headers)
        expect(result.valid).toBe(true)
    })

    it('should extract key from x-api-key header', async () => {
        const { key } = await keys.create({ ownerId: 'user_1' })

        const headers = new Headers({
            'x-api-key': key,
        })

        const result = await keys.verify(headers)
        expect(result.valid).toBe(true)
    })

    it('should extract key from plain object', async () => {
        const { key } = await keys.create({ ownerId: 'user_1' })

        const headers = {
            'authorization': `Bearer ${key}`,
        }

        const result = await keys.verify(headers)
        expect(result.valid).toBe(true)
    })

    it('should support custom header names per request', async () => {
        const { key } = await keys.create({ ownerId: 'user_1' })

        const headers = new Headers({
            'x-custom-auth': key,
        })

        const result = await keys.verify(headers, {
            headerNames: ['x-custom-auth'],
        })

        expect(result.valid).toBe(true)
    })

    it('should provide extractKey helper', () => {
        const headers = new Headers({
            'x-api-key': 'sk_test_123',
        })

        const key = keys.extractKey(headers)
        expect(key).toBe('sk_test_123')
    })

    it('should provide hasKey helper', () => {
        const headers1 = new Headers({
            'x-api-key': 'sk_test_123',
        })

        const headers2 = new Headers({
            'content-type': 'application/json',
        })

        expect(keys.hasKey(headers1)).toBe(true)
        expect(keys.hasKey(headers2)).toBe(false)
    })
})

describe('ApiKeyManager - Config-based Header Extraction', () => {
    it('should use default header names from config', async () => {
        const keys = createKeys({ prefix: 'sk_' })
        const { key } = await keys.create({ ownerId: 'user_1' })

        const headers = new Headers({
            'authorization': `Bearer ${key}`,
        })

        const result = await keys.verify(headers)
        expect(result.valid).toBe(true)
    })

    it('should use custom header names from config', async () => {
        const keys = createKeys({
            prefix: 'sk_',
            headerNames: ['x-custom-auth', 'x-api-token'],
        })
        const { key } = await keys.create({ ownerId: 'user_1' })

        const headers = new Headers({
            'x-custom-auth': key,
        })

        const result = await keys.verify(headers)
        expect(result.valid).toBe(true)
    })

    it('should respect extractBearer config option', async () => {
        const keys = createKeys({
            prefix: 'sk_',
            extractBearer: false,
        })
        const { key } = await keys.create({ ownerId: 'user_1' })

        const headers = new Headers({
            'authorization': key,
        })

        const result = await keys.verify(headers)
        expect(result.valid).toBe(true)
    })

    it('should allow overriding header names per request', async () => {
        const keys = createKeys({
            prefix: 'sk_',
            headerNames: ['authorization'],
        })
        const { key } = await keys.create({ ownerId: 'user_1' })

        const headers = new Headers({
            'x-special-key': key,
        })

        const result = await keys.verify(headers, {
            headerNames: ['x-special-key'],
        })

        expect(result.valid).toBe(true)
    })

    it('should use config headers with hasKey helper', async () => {
        const keys = createKeys({
            prefix: 'sk_',
            headerNames: ['x-api-key'],
        })

        const headers1 = new Headers({
            'x-api-key': 'sk_test_123',
        })

        const headers2 = new Headers({
            'authorization': 'Bearer sk_test_123',
        })

        expect(keys.hasKey(headers1)).toBe(true)
        expect(keys.hasKey(headers2)).toBe(false)
    })

    it('should use config headers with extractKey helper', async () => {
        const keys = createKeys({
            prefix: 'sk_',
            headerNames: ['x-custom-token'],
        })

        const headers = new Headers({
            'x-custom-token': 'sk_test_123',
        })

        const extracted = keys.extractKey(headers)
        expect(extracted).toBe('sk_test_123')
    })

    it('should work with multiple configured header names', async () => {
        const keys = createKeys({
            prefix: 'sk_',
            headerNames: ['x-api-key', 'x-api-token', 'authorization'],
        })
        const { key } = await keys.create({ ownerId: 'user_1' })

        const headers1 = new Headers({ 'x-api-key': key })
        const headers2 = new Headers({ 'x-api-token': key })
        const headers3 = new Headers({ 'authorization': `Bearer ${key}` })

        const result1 = await keys.verify(headers1)
        const result2 = await keys.verify(headers2)
        const result3 = await keys.verify(headers3)

        expect(result1.valid).toBe(true)
        expect(result2.valid).toBe(true)
        expect(result3.valid).toBe(true)
    })

    it('should prefer first configured header when multiple present', async () => {
        const keys = createKeys({
            prefix: 'sk_',
            headerNames: ['x-primary-key', 'x-secondary-key'],
        })
        const { key: key1 } = await keys.create({ ownerId: 'user_1' })
        const { key: key2 } = await keys.create({ ownerId: 'user_2' })

        const headers = new Headers({
            'x-primary-key': key1,
            'x-secondary-key': key2,
        })

        const result = await keys.verify(headers)
        expect(result.valid).toBe(true)
        expect(result.record?.metadata.ownerId).toBe('user_1')
    })
})

describe('ApiKeyManager - Caching', () => {
    describe('without cache', () => {
        it('should work normally without caching', async () => {
            const keys = createKeys({ prefix: 'sk_' })
            const { key } = await keys.create({ ownerId: 'user_1' })

            const result1 = await keys.verify(key)
            const result2 = await keys.verify(key)

            expect(result1.valid).toBe(true)
            expect(result2.valid).toBe(true)
        })
    })

    describe('with in-memory cache (cache: true)', () => {
        it('should enable memory cache by default', async () => {
            const keys = createKeys({ prefix: 'sk_', cache: true })
            const { key } = await keys.create({ ownerId: 'user_1' })

            const result1 = await keys.verify(key)
            const result2 = await keys.verify(key)

            expect(result1.valid).toBe(true)
            expect(result2.valid).toBe(true)
        })

        it('should cache valid keys', async () => {
            const storage = new MemoryStore()
            const keys = createKeys({
                prefix: 'sk_',
                cache: true,
                storage,
            })

            const { key } = await keys.create({ ownerId: 'user_1' })

            const spyFindByHash = vi.spyOn(storage, 'findByHash')

            await keys.verify(key)
            await keys.verify(key)
            await keys.verify(key)

            expect(spyFindByHash).toHaveBeenCalledTimes(1)
        })

        it('should not cache invalid keys', async () => {
            const keys = createKeys({ prefix: 'sk_', cache: true })

            const result1 = await keys.verify('sk_invalid_123')
            const result2 = await keys.verify('sk_invalid_123')

            expect(result1.valid).toBe(false)
            expect(result2.valid).toBe(false)
        })

        it('should invalidate cache on revoke', async () => {
            const storage = new MemoryStore()
            const keys = createKeys({
                prefix: 'sk_',
                cache: true,
                storage,
            })

            const { key, record } = await keys.create({ ownerId: 'user_1' })

            const result1 = await keys.verify(key)
            expect(result1.valid).toBe(true)

            await keys.revoke(record.id)

            const result2 = await keys.verify(key)
            expect(result2.valid).toBe(false)
        })

        it('should skip cache when skipCache option is true', async () => {
            const storage = new MemoryStore()
            const keys = createKeys({
                prefix: 'sk_',
                cache: true,
                storage,
            })

            const { key } = await keys.create({ ownerId: 'user_1' })

            const spyFindByHash = vi.spyOn(storage, 'findByHash')

            await keys.verify(key)
            await keys.verify(key, { skipCache: true })

            expect(spyFindByHash).toHaveBeenCalledTimes(2)
        })

        it('should not cache expired keys', async () => {
            const keys = createKeys({ prefix: 'sk_', cache: true })

            const pastDate = new Date()
            pastDate.setFullYear(pastDate.getFullYear() - 1)

            const { key } = await keys.create({
                ownerId: 'user_1',
                expiresAt: pastDate.toISOString(),
            })

            const result1 = await keys.verify(key)
            const result2 = await keys.verify(key)

            expect(result1.valid).toBe(false)
            expect(result2.valid).toBe(false)
        })

        it('should invalidate cache for all user keys on revokeAll', async () => {
            const storage = new MemoryStore()
            const keys = createKeys({
                prefix: 'sk_',
                cache: true,
                storage,
            })

            const { key: key1 } = await keys.create({ ownerId: 'user_1' })
            const { key: key2 } = await keys.create({ ownerId: 'user_1' })

            await keys.verify(key1)
            await keys.verify(key2)

            await keys.revokeAll('user_1')

            const result1 = await keys.verify(key1)
            const result2 = await keys.verify(key2)

            expect(result1.valid).toBe(false)
            expect(result2.valid).toBe(false)
        })
    })

    describe('with custom cache', () => {
        it('should use custom cache implementation', async () => {
            const customCache = new MemoryCache()
            const keys = createKeys({
                prefix: 'sk_',
                cache: customCache,
            })

            const { key } = await keys.create({ ownerId: 'user_1' })

            const result = await keys.verify(key)
            expect(result.valid).toBe(true)

            const cacheKey = `apikey:${keys.hashKey(key)}`
            const cached = customCache.get(cacheKey)
            expect(cached).toBeTruthy()
        })

        it('should allow manual cache invalidation', async () => {
            const keys = createKeys({ prefix: 'sk_', cache: true })
            const { key, record } = await keys.create({ ownerId: 'user_1' })

            await keys.verify(key)
            await keys.invalidateCache(record.keyHash)

            const result = await keys.verify(key)
            expect(result.valid).toBe(true)
        })
    })
})
