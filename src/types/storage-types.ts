import type { ApiKeyRecord, ApiKeyMetadata } from './api-key-types'

/**
 * Storage interface for persisting API keys
 */
export interface Storage {
    /**
     * Save an API key record to storage
     */
    save(record: ApiKeyRecord): Promise<void>

    /**
     * Find an API key record by its hash
     */
    findByHash(keyHash: string): Promise<ApiKeyRecord | null>

    /**
     * Find an API key record by ID
     */
    findById(id: string): Promise<ApiKeyRecord | null>

    /**
     * Find all API keys for a specific owner
     */
    findByOwner(ownerId: string): Promise<ApiKeyRecord[]>

    /**
     * Update metadata for an existing key
     */
    updateMetadata(id: string, metadata: Partial<ApiKeyMetadata>): Promise<void>

    /**
     * Delete an API key record
     */
    delete(id: string): Promise<void>

    /**
     * Delete all keys for a specific owner
     */
    deleteByOwner(ownerId: string): Promise<void>
}

/**
 * Options for storage operations
 */
export interface StorageOptions {
    /** Optional TTL (time to live) in seconds */
    ttl?: number
}

/**
 * Column mapping configuration for Drizzle adapter
 * Maps library fields to user's database column names
 */
export interface DrizzleColumnMapping {
    /** Column name for the key ID (default: 'id') */
    id?: string

    /** Column name for the hashed key (default: 'keyHash') */
    keyHash?: string

    /** Column name for the owner ID (default: 'ownerId') */
    ownerId?: string

    /** Column name for the key name (default: 'name') */
    name?: string

    /** Column name for the description (default: 'description') */
    description?: string

    /** Column name for scopes (default: 'scopes') */
    scopes?: string

    /** Column name for expiration date (default: 'expiresAt') */
    expiresAt?: string

    /** Column name for creation date (default: 'createdAt') */
    createdAt?: string

    /** Column name for last used date (default: 'lastUsedAt') */
    lastUsedAt?: string

    /** Column name for enabled status (default: 'enabled') */
    enabled?: string

    /** Column name for revoked date (default: 'revokedAt') */
    revokedAt?: string

    /** Column name for rotated to key ID (default: 'rotatedTo') */
    rotatedTo?: string
}
