import type { Config, ConfigInput } from './types/config-types'
import type { ApiKeyRecord, ApiKeyMetadata } from './types/api-key-types'
import type { Storage } from './types/storage-types'
import type { PermissionScope } from './types/permissions-types'
import { generateKey } from './core/generate'
import { hashKey } from './core/hash'
import { validateKey } from './core/validate'
import { isExpired } from './core/expiration'
import { hasScope, hasAnyScope, hasAllScopes } from './core/scopes'
import { nanoid } from 'nanoid'
import { MemoryStore } from './storage/memory'

export interface VerifyResult {
    valid: boolean
    record?: ApiKeyRecord
    error?: string
}

export class ApiKeyManager {
    private config: Config
    private storage: Storage

    constructor(config: ConfigInput = {}, storage?: Storage) {
        this.config = {
            prefix: config.prefix,
            length: config.length ?? 32,
            algorithm: config.algorithm ?? 'sha256',
        }
        this.storage = storage ?? new MemoryStore()
    }

    /**
     * Generate a new API key using the configured settings
     */
    generateKey(): string {
        return generateKey({
            prefix: this.config.prefix,
            length: this.config.length,
        })
    }

    /**
     * Hash an API key using the configured algorithm
     */
    hashKey(key: string): string {
        return hashKey(key, this.config.algorithm)
    }

    /**
     * Validate an API key against a stored hash
     */
    validateKey(key: string, storedHash: string): boolean {
        return validateKey(key, storedHash, this.config.algorithm)
    }

    /**
     * Verify an API key (consolidated auth flow)
     * Accepts Authorization header or raw key
     */
    async verify(keyOrHeader: string): Promise<VerifyResult> {
        // Extract key from "Bearer sk_..." or just use as-is
        let key = keyOrHeader
        if (keyOrHeader.startsWith('Bearer ')) {
            key = keyOrHeader.slice(7).trim()
        }

        if (!key) {
            return { valid: false, error: 'Missing API key' }
        }

        // Check prefix if configured
        if (this.config.prefix && !key.startsWith(this.config.prefix)) {
            return { valid: false, error: 'Invalid API key format' }
        }

        // Hash and find
        const keyHash = this.hashKey(key)
        const record = await this.storage.findByHash(keyHash)

        if (!record) {
            return { valid: false, error: 'Invalid API key' }
        }

        // Check expiration
        if (isExpired(record.metadata.expiresAt)) {
            return { valid: false, error: 'API key has expired' }
        }

        return { valid: true, record }
    }

    /**
     * Create a new API key with metadata
     */
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

    /**
     * Find an API key record by its hash
     */
    async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
        return this.storage.findByHash(keyHash)
    }

    /**
     * Find an API key record by ID
     */
    async findById(id: string): Promise<ApiKeyRecord | null> {
        return this.storage.findById(id)
    }

    /**
     * List all API keys for a specific owner
     */
    async list(ownerId: string): Promise<ApiKeyRecord[]> {
        return this.storage.findByOwner(ownerId)
    }

    /**
     * Revoke (delete) an API key
     */
    async revoke(id: string): Promise<void> {
        return this.storage.delete(id)
    }

    /**
     * Revoke all keys for a specific owner
     */
    async revokeAll(ownerId: string): Promise<void> {
        return this.storage.deleteByOwner(ownerId)
    }

    /**
     * Check if a key record is expired
     */
    isExpired(record: ApiKeyRecord): boolean {
        return isExpired(record.metadata.expiresAt)
    }

    /**
     * Check if a key has a specific scope
     */
    hasScope(record: ApiKeyRecord, scope: PermissionScope): boolean {
        return hasScope(record.metadata.scopes, scope)
    }

    /**
     * Check if a key has any of the provided scopes
     */
    hasAnyScope(record: ApiKeyRecord, requiredScopes: PermissionScope[]): boolean {
        return hasAnyScope(record.metadata.scopes, requiredScopes)
    }

    /**
     * Check if a key has all of the provided scopes
     */
    hasAllScopes(record: ApiKeyRecord, requiredScopes: PermissionScope[]): boolean {
        return hasAllScopes(record.metadata.scopes, requiredScopes)
    }
}

/**
 * Create a new API key manager with simplified API
 */
export function createKeys(config: ConfigInput = {}, storage?: Storage): ApiKeyManager {
    return new ApiKeyManager(config, storage)
}
