import type { ApiKeyRecord } from "../../types/api-key-types";
import type { AuditLog } from "../../types/audit-log-types";
import type { Storage } from "../../types/storage-types";

/**
 * Configuration for the adapter factory
 */
export type AdapterFactoryConfig = {
	/** Unique identifier for this adapter (e.g., 'drizzle', 'prisma') */
	adapterId: string;

	/** Display name for logging (e.g., 'Drizzle ORM', 'Prisma') */
	adapterName: string;

	/** Whether the database supports native JSON/JSONB columns */
	supportsJSON: boolean;

	/** Whether the database supports native Date columns */
	supportsDates?: boolean;

	/** Whether the database supports native boolean columns */
	supportsBooleans?: boolean;

	/** Whether to use plural table names (e.g., 'apikeys' vs 'apikey') */
	usePlural?: boolean;

	/** Whether to disable automatic ID generation */
	disableIdGeneration?: boolean;

	/** Custom ID generator function */
	customIdGenerator?: () => string;

	/** Whether to disable input transformations (for performance) */
	disableTransformInput?: boolean;

	/** Whether to disable output transformations (for performance) */
	disableTransformOutput?: boolean;

	/** Enable debug logging */
	debugLogs?: boolean | {
		save?: boolean;
		findByHash?: boolean;
		findById?: boolean;
		findByOwner?: boolean;
		findByTags?: boolean;
		updateMetadata?: boolean;
		delete?: boolean;
		deleteByOwner?: boolean;
		saveLog?: boolean;
		findLogs?: boolean;
		countLogs?: boolean;
		deleteLogs?: boolean;
		getLogStats?: boolean;
	};
};

/**
 * Column mapping for API keys table
 */
export type ApiKeyColumnMapping = {
	/** Column name for the key ID (default: 'id') */
	id?: string;

	/** Column name for the hashed key (default: 'keyHash') */
	keyHash?: string;

	/** Column name for the metadata (default: 'metadata') */
	metadata?: string;

	/** Custom columns mapping for metadata fields */
	metadataColumns?: {
		ownerId?: string;
		name?: string;
		description?: string;
		scopes?: string;
		resources?: string;
		rateLimit?: string;
		expiresAt?: string;
		revokedAt?: string;
		lastUsedAt?: string;
		createdAt?: string;
		tags?: string;
		allowedIps?: string;
		allowedOrigins?: string;
		[key: string]: string | undefined;
	};
};

/**
 * Column mapping for audit logs table
 */
export type AuditLogColumnMapping = {
	id?: string;
	keyId?: string;
	ownerId?: string;
	action?: string;
	timestamp?: string;
	data?: string;
};

/**
 * Schema configuration for both tables
 */
export type SchemaConfig = {
	/** Table name for API keys (default: 'apikey' or 'apikeys') */
	apiKeyTable?: string;

	/** Column mappings for API keys table */
	apiKeyColumns?: ApiKeyColumnMapping;

	/** Table name for audit logs (default: 'auditlog' or 'auditlogs') */
	auditLogTable?: string;

	/** Column mappings for audit logs table */
	auditLogColumns?: AuditLogColumnMapping;

	/** Whether to use flattened schema (metadata as separate columns) */
	flattenMetadata?: boolean;
};

/**
 * Context passed to the adapter implementation
 */
export type AdapterContext = {
	/** Configuration for this adapter */
	config: AdapterFactoryConfig;

	/** Schema configuration */
	schema: SchemaConfig;

	/** Debug logging helper */
	debugLog: (...args: unknown[]) => void;

	/** Get the mapped column name for a field */
	getColumnName: (table: "apikey" | "auditlog", field: string) => string;

	/** Get the table name */
	getTableName: (table: "apikey" | "auditlog") => string;

	/** Transform an API key record for database insertion */
	transformApiKeyInput: (record: ApiKeyRecord) => Record<string, unknown>;

	/** Transform database row back to API key record */
	transformApiKeyOutput: (row: Record<string, unknown>) => ApiKeyRecord;

	/** Transform an audit log for database insertion */
	transformAuditLogInput?: (log: AuditLog) => Record<string, unknown>;

	/** Transform database row back to audit log */
	transformAuditLogOutput?: (row: Record<string, unknown>) => AuditLog;
};

/**
 * Adapter implementation function
 */
export type AdapterImplementation = (context: AdapterContext) => Storage;

/**
 * Options for creating an adapter
 */
export type AdapterFactoryOptions = {
	/** The adapter configuration */
	config: AdapterFactoryConfig;

	/** The adapter implementation */
	adapter: AdapterImplementation;

	/** Optional schema configuration */
	schema?: SchemaConfig;
};

