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
            alphabet: config.alphabet,
            salt: config.salt,
        }
        this.storage = storage ?? new MemoryStore()
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

    async verify(keyOrHeader: string): Promise<VerifyResult> {
        let key = keyOrHeader
        if (keyOrHeader.startsWith('Bearer ')) {
            key = keyOrHeader.slice(7).trim()
        }

        if (!key) {
            return { valid: false, error: 'Missing API key' }
        }

        if (this.config.prefix && !key.startsWith(this.config.prefix)) {
            return { valid: false, error: 'Invalid API key format' }
        }

        const keyHash = this.hashKey(key)
        const record = await this.storage.findByHash(keyHash)

        if (!record) {
            return { valid: false, error: 'Invalid API key' }
        }

        if (isExpired(record.metadata.expiresAt)) {
            return { valid: false, error: 'API key has expired' }
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
        return this.storage.delete(id)
    }

    async revokeAll(ownerId: string): Promise<void> {
        return this.storage.deleteByOwner(ownerId)
    }

    async updateLastUsed(id: string): Promise<void> {
        await this.storage.updateMetadata(id, {
            lastUsedAt: new Date().toISOString(),
        })
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

export function createKeys(config: ConfigInput = {}, storage?: Storage): ApiKeyManager {
    return new ApiKeyManager(config, storage)
}
