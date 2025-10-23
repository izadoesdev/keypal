import type { Config, ConfigInput } from './types/config-types'
import type { ApiKeyRecord, ApiKeyMetadata } from './types/api-key-types'
import type { Storage } from './types/storage-types'
import type { PermissionScope } from './types/permissions-types'
import { generateKey } from './core/generate'
import { hashKey } from './core/hash'
import { validateKey } from './core/validate'
import { isExpired } from './core/expiration'
import { hasScope, hasAnyScope, hasAllScopes } from './core/scopes'
import { extractKeyFromHeaders, hasApiKey, type KeyExtractionOptions } from './core/extract-key'
import { MemoryCache, type Cache } from './core/cache'
import { nanoid } from 'nanoid'
import { MemoryStore } from './storage/memory'

export interface VerifyResult {
    valid: boolean
    record?: ApiKeyRecord
    error?: string
}

export interface VerifyOptions {
    skipCache?: boolean
    headerNames?: string[]
    extractBearer?: boolean
}

export class ApiKeyManager {
    private config: Config
    private storage: Storage
    private cache?: Cache
    private cacheTtl: number
    private extractionOptions: KeyExtractionOptions

    constructor(config: ConfigInput = {}) {
        this.config = {
            prefix: config.prefix,
            length: config.length ?? 32,
            algorithm: config.algorithm ?? 'sha256',
            alphabet: config.alphabet,
            salt: config.salt,
        }

        if (config.storage === 'redis') {
            if (!config.redis) {
                throw new Error('Redis client required when storage is "redis"')
            }
            try {
                const { RedisStore } = require('./storage/redis')
                this.storage = new RedisStore({ client: config.redis })
            } catch (error) {
                console.error('[better-api-keys] CRITICAL: Failed to initialize Redis storage:', error)
                throw error
            }
        } else if (config.storage && typeof config.storage === 'object') {
            this.storage = config.storage
        } else {
            this.storage = new MemoryStore()
        }

        this.cacheTtl = config.cacheTtl ?? 60
        this.extractionOptions = {
            headerNames: config.headerNames,
            extractBearer: config.extractBearer,
        }

        if (config.cache === 'redis') {
            if (!config.redis) {
                throw new Error('Redis client required when cache is "redis"')
            }
            try {
                const { RedisCache } = require('./core/cache')
                this.cache = new RedisCache(config.redis)
            } catch (error) {
                console.error('[better-api-keys] CRITICAL: Failed to initialize Redis cache:', error)
                throw error
            }
        } else if (config.cache === true) {
            this.cache = new MemoryCache()
        } else if (config.cache && typeof config.cache === 'object') {
            this.cache = config.cache
        }
    }

    generateKey(): string {
        return generateKey({
            prefix: this.config.prefix,
            length: this.config.length,
            alphabet: this.config.alphabet,
        })
    }

    hashKey(key: string): string {
        return hashKey(key, {
            algorithm: this.config.algorithm,
            salt: this.config.salt,
        })
    }

    validateKey(key: string, storedHash: string): boolean {
        return validateKey(key, storedHash, {
            algorithm: this.config.algorithm,
            salt: this.config.salt,
        })
    }

    extractKey(
        headers: Record<string, string | undefined> | Headers,
        options?: KeyExtractionOptions
    ): string | null {
        const mergedOptions = {
            headerNames: options?.headerNames ?? this.extractionOptions.headerNames,
            extractBearer: options?.extractBearer ?? this.extractionOptions.extractBearer,
        }
        return extractKeyFromHeaders(headers, mergedOptions)
    }

    hasKey(
        headers: Record<string, string | undefined> | Headers,
        options?: KeyExtractionOptions
    ): boolean {
        const mergedOptions = {
            headerNames: options?.headerNames ?? this.extractionOptions.headerNames,
            extractBearer: options?.extractBearer ?? this.extractionOptions.extractBearer,
        }
        return hasApiKey(headers, mergedOptions)
    }

    async verify(keyOrHeader: string | Record<string, string | undefined> | Headers, options: VerifyOptions = {}): Promise<VerifyResult> {
        let key: string | null

        if (typeof keyOrHeader === 'string') {
            key = keyOrHeader
            if (keyOrHeader.startsWith('Bearer ')) {
                key = keyOrHeader.slice(7).trim()
            }
        } else {
            const extractOptions: KeyExtractionOptions = {
                headerNames: options.headerNames ?? this.extractionOptions.headerNames,
                extractBearer: options.extractBearer ?? this.extractionOptions.extractBearer,
            }
            key = this.extractKey(keyOrHeader, extractOptions)
        }

        if (!key) {
            return { valid: false, error: 'Missing API key' }
        }

        if (this.config.prefix && !key.startsWith(this.config.prefix)) {
            return { valid: false, error: 'Invalid API key format' }
        }

        const keyHash = this.hashKey(key)

        if (this.cache && !options.skipCache) {
            const cached = await this.cache.get(`apikey:${keyHash}`)
            if (cached) {
                try {
                    const record = JSON.parse(cached) as ApiKeyRecord
                    if (!isExpired(record.metadata.expiresAt)) {
                        return { valid: true, record }
                    }
                    await this.cache.del(`apikey:${keyHash}`)
                } catch (error) {
                    console.error('[better-api-keys] CRITICAL: Cache corruption detected, invalidating entry:', error)
                    await this.cache.del(`apikey:${keyHash}`)
                }
            }
        }

        const record = await this.storage.findByHash(keyHash)

        if (!record) {
            return { valid: false, error: 'Invalid API key' }
        }

        if (isExpired(record.metadata.expiresAt)) {
            if (this.cache) {
                await this.cache.del(`apikey:${keyHash}`)
            }
            return { valid: false, error: 'API key has expired' }
        }

        if (this.cache && !options.skipCache) {
            try {
                await this.cache.set(`apikey:${keyHash}`, JSON.stringify(record), this.cacheTtl)
            } catch (error) {
                console.error('[better-api-keys] CRITICAL: Failed to write to cache:', error)
            }
        }

        return { valid: true, record }
    }

    async create(metadata: Partial<ApiKeyMetadata>): Promise<{ key: string; record: ApiKeyRecord }> {
        const key = this.generateKey()
        const keyHash = this.hashKey(key)
        const now = new Date().toISOString()

        const record: ApiKeyRecord = {
            id: nanoid(),
            keyHash,
            metadata: {
                ownerId: metadata.ownerId ?? '',
                name: metadata.name,
                description: metadata.description,
                scopes: metadata.scopes,
                expiresAt: metadata.expiresAt ?? null,
                createdAt: now,
                lastUsedAt: undefined,
            },
        }

        await this.storage.save(record)
        return { key, record }
    }

    async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
        return this.storage.findByHash(keyHash)
    }

    async findById(id: string): Promise<ApiKeyRecord | null> {
        return this.storage.findById(id)
    }

    async list(ownerId: string): Promise<ApiKeyRecord[]> {
        return this.storage.findByOwner(ownerId)
    }

    async revoke(id: string): Promise<void> {
        const record = await this.findById(id)
        if (record && this.cache) {
            try {
                await this.cache.del(`apikey:${record.keyHash}`)
            } catch (error) {
                console.error('[better-api-keys] CRITICAL: Failed to invalidate cache on revoke:', error)
            }
        }
        return this.storage.delete(id)
    }

    async revokeAll(ownerId: string): Promise<void> {
        if (this.cache) {
            const records = await this.list(ownerId)
            for (const record of records) {
                try {
                    await this.cache.del(`apikey:${record.keyHash}`)
                } catch (error) {
                    console.error('[better-api-keys] CRITICAL: Failed to invalidate cache on revokeAll:', error)
                }
            }
        }
        return this.storage.deleteByOwner(ownerId)
    }

    async updateLastUsed(id: string): Promise<void> {
        await this.storage.updateMetadata(id, {
            lastUsedAt: new Date().toISOString(),
        })
    }

    async invalidateCache(keyHash: string): Promise<void> {
        if (this.cache) {
            try {
                await this.cache.del(`apikey:${keyHash}`)
            } catch (error) {
                console.error('[better-api-keys] CRITICAL: Failed to invalidate cache:', error)
                throw error
            }
        }
    }

    isExpired(record: ApiKeyRecord): boolean {
        return isExpired(record.metadata.expiresAt)
    }

    hasScope(record: ApiKeyRecord, scope: PermissionScope): boolean {
        return hasScope(record.metadata.scopes, scope)
    }

    hasAnyScope(record: ApiKeyRecord, requiredScopes: PermissionScope[]): boolean {
        return hasAnyScope(record.metadata.scopes, requiredScopes)
    }

    hasAllScopes(record: ApiKeyRecord, requiredScopes: PermissionScope[]): boolean {
        return hasAllScopes(record.metadata.scopes, requiredScopes)
    }
}

export function createKeys(config: ConfigInput = {}): ApiKeyManager {
    return new ApiKeyManager(config)
}
