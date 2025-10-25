import type { ApiKeyMetadata, ApiKeyRecord } from "./api-key-types";

/**
 * Storage interface for persisting API keys
 */
export type Storage = {
	/**
	 * Save an API key record to storage
	 */
	save(record: ApiKeyRecord): Promise<void>;

	/**
	 * Find an API key record by its hash
	 */
	findByHash(keyHash: string): Promise<ApiKeyRecord | null>;

	/**
	 * Find an API key record by ID
	 */
	findById(id: string): Promise<ApiKeyRecord | null>;

	/**
	 * Find all API keys for a specific owner
	 */
	findByOwner(ownerId: string): Promise<ApiKeyRecord[]>;

	/**
	 * Find all API keys by tag(s)
	 * @param tag - The tag(s) to search for {string | string[]}
	 * @param ownerId - The owner ID to filter by (optional) {string}
	 */
	findByTag(tag: string | string[], ownerId?: string): Promise<ApiKeyRecord[]>;

	/**
	 * Update metadata for an existing key
	 */
	updateMetadata(id: string, metadata: Partial<ApiKeyMetadata>): Promise<void>;

	/**
	 * Delete an API key record
	 */
	delete(id: string): Promise<void>;

	/**
	 * Delete all keys for a specific owner
	 */
	deleteByOwner(ownerId: string): Promise<void>;
};

/**
 * Options for storage operations
 */
export type StorageOptions = {
	/** Optional TTL (time to live) in seconds */
	ttl?: number;
};

/**
 * Column mapping configuration for Drizzle adapter
 * Maps library fields to user's database column names
 */
export type DrizzleColumnMapping = {
	/** Column name for the key ID (default: 'id') */
	id?: string;

	/** Column name for the hashed key (default: 'keyHash') */
	keyHash?: string;

	/** Column name for the metadata JSONB (default: 'metadata') */
	metadata?: string;
};
