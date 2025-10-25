import type { ApiKeyMetadata, ApiKeyRecord } from "./api-key-types";
import type { AuditLog, AuditLogQuery, AuditLogStats } from "./audit-log-types";

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
	 * Find all API keys by tags and optionally by owner
	 * @param tags - Tags to search for
	 * @param ownerId - Optional owner ID to filter results
	 */
	findByTags(tags: string[], ownerId?: string): Promise<ApiKeyRecord[]>;

	/**
	 * Find all API keys by tag and optionally by owner
	 * @param tag - Tag to search for
	 * @param ownerId - Optional owner ID to filter results
	 */
	findByTag(tag: string, ownerId?: string): Promise<ApiKeyRecord[]>;

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

	/**
	 * Save an audit log entry (optional, only if audit logging is enabled)
	 */
	saveLog?(log: AuditLog): Promise<void>;

	/**
	 * Query audit logs (optional, only if audit logging is enabled)
	 */
	findLogs?(query: AuditLogQuery): Promise<AuditLog[]>;

	/**
	 * Count audit logs matching query (optional, only if audit logging is enabled)
	 */
	countLogs?(query: AuditLogQuery): Promise<number>;

	/**
	 * Delete audit logs matching query (optional, only if audit logging is enabled)
	 * @returns Number of logs deleted
	 */
	deleteLogs?(query: AuditLogQuery): Promise<number>;

	/**
	 * Get statistics about audit logs (optional, only if audit logging is enabled)
	 */
	getLogStats?(ownerId: string): Promise<AuditLogStats>;
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
