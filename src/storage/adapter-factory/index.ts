import type { ApiKeyRecord, ApiKeyMetadata } from "../../types/api-key-types";
import type { AuditLog, AuditLogQuery, AuditLogStats, AuditAction } from "../../types/audit-log-types";
import type { Storage } from "../../types/storage-types";
import { generateKey } from "../../core/generate";
import { logger } from "../../utils/logger";
import type {
	AdapterFactoryConfig,
	AdapterFactoryOptions,
	AdapterContext,
	SchemaConfig,
	ApiKeyColumnMapping,
	AuditLogColumnMapping,
} from "./types";

export * from "./types";
export { DEFAULT_QUERY_LIMIT, calculateLogStats } from "../utils";

/**
 * Creates a storage adapter with automatic transformations and field mapping
 */
export const createAdapterFactory = (
	options: AdapterFactoryOptions	
): Storage => {
	const config: AdapterFactoryConfig = {
		supportsDates: true,
		supportsBooleans: true,
		usePlural: false,
		disableIdGeneration: false,
		debugLogs: false,
		...options.config,
	};

	const schema: SchemaConfig = {
		apiKeyTable: config.usePlural ? "apikeys" : "apikey",
		auditLogTable: config.usePlural ? "auditlogs" : "auditlog",
		flattenMetadata: false,
		...options.schema,
	};

	const debugLog = (...args: unknown[]) => {
		if (!config.debugLogs) return;

		if (typeof config.debugLogs === "boolean") {
			logger.info(`[${config.adapterName}]`, ...args);
			return;
		}

		const method = typeof args[0] === "string" ? args[0] : null;
		if (method && config.debugLogs[method as keyof typeof config.debugLogs]) {
			logger.info(`[${config.adapterName}]`, ...args);
		}
	};

	// Get table name
	const getTableName = (table: "apikey" | "auditlog"): string => {
		return table === "apikey" ? schema.apiKeyTable! : schema.auditLogTable!;
	};

	// Get column name with mapping
	const getColumnName = (table: "apikey" | "auditlog", field: string): string => {
		if (table === "apikey") {
			const mapping = schema.apiKeyColumns || {};
			
			// Check if it's a metadata field
			if (mapping.metadataColumns && field in mapping.metadataColumns) {
				return mapping.metadataColumns[field] || field;
			}
			
			// Check standard fields
			if (field === "id") return mapping.id || "id";
			if (field === "keyHash") return mapping.keyHash || "keyHash";
			if (field === "metadata") return mapping.metadata || "metadata";
		} else {
			const mapping = schema.auditLogColumns || {};
			return (mapping as Record<string, string>)[field] || field;
		}

		return field;
	};

	// Transform API key record for database insertion
	const transformApiKeyInput = (record: ApiKeyRecord): Record<string, unknown> => {
		const transformed: Record<string, unknown> = {};

		// Handle flattened metadata schema
		if (schema.flattenMetadata) {
			// Store ID and keyHash
			transformed[getColumnName("apikey", "id")] = record.id;
			transformed[getColumnName("apikey", "keyHash")] = record.keyHash;

			// Flatten metadata fields
			for (const [key, value] of Object.entries(record.metadata)) {
				const colName = getColumnName("apikey", key);
				
				// Handle different data types
				if (value === null || value === undefined) {
					transformed[colName] = null;
				} else if (typeof value === "object") {
					// Arrays and objects need JSON serialization if DB doesn't support JSON
					if (config.supportsJSON) {
						transformed[colName] = value;
					} else {
						transformed[colName] = JSON.stringify(value);
					}
				} else if (value && typeof value === "object" && "toISOString" in value) {
					// Date handling
					if (config.supportsDates) {
						transformed[colName] = value;
					} else {
						transformed[colName] = (value as Date).toISOString();
					}
				} else if (typeof value === "boolean") {
					// Boolean handling
					if (config.supportsBooleans) {
						transformed[colName] = value;
					} else {
						transformed[colName] = value ? 1 : 0;
					}
				} else {
					transformed[colName] = value;
				}
			}
		} else {
			// Store as JSONB or stringified JSON
			transformed[getColumnName("apikey", "id")] = record.id;
			transformed[getColumnName("apikey", "keyHash")] = record.keyHash;

			if (config.supportsJSON) {
				transformed[getColumnName("apikey", "metadata")] = record.metadata;
			} else {
				transformed[getColumnName("apikey", "metadata")] = JSON.stringify(record.metadata);
			}
		}

		return transformed;
	};

	// Transform database row back to API key record
	const transformApiKeyOutput = (row: Record<string, unknown>): ApiKeyRecord => {
		const id = String(row[getColumnName("apikey", "id")]);
		const keyHash = String(row[getColumnName("apikey", "keyHash")]);

		let metadata: ApiKeyMetadata;

		if (schema.flattenMetadata) {
			// Reconstruct metadata from flattened columns
			metadata = {} as ApiKeyMetadata;
			const metadataFields = [
				"ownerId",
				"name",
				"description",
				"scopes",
				"resources",
				"rateLimit",
				"expiresAt",
				"revokedAt",
				"lastUsedAt",
				"createdAt",
				"tags",
				"allowedIps",
				"allowedOrigins",
			];

			for (const field of metadataFields) {
				const colName = getColumnName("apikey", field);
				const value = row[colName];

				if (value !== undefined && value !== null) {
					// Handle type conversions
					if (field === "expiresAt" || field === "revokedAt" || field === "lastUsedAt" || field === "createdAt") {
						// Date fields
						if (typeof value === "string" && !config.supportsDates) {
							(metadata as Record<string, unknown>)[field] = new Date(value);
						} else {
							(metadata as Record<string, unknown>)[field] = value;
						}
					} else if (field === "scopes" || field === "resources" || field === "tags" || field === "allowedIps" || field === "allowedOrigins") {
						// Array fields
						if (typeof value === "string" && !config.supportsJSON) {
							(metadata as Record<string, unknown>)[field] = JSON.parse(value);
						} else {
							(metadata as Record<string, unknown>)[field] = value;
						}
					} else if (field === "rateLimit") {
						// Object field
						if (typeof value === "string" && !config.supportsJSON) {
							(metadata as Record<string, unknown>)[field] = JSON.parse(value);
						} else {
							(metadata as Record<string, unknown>)[field] = value;
						}
					} else {
						(metadata as Record<string, unknown>)[field] = value;
					}
				}
			}
		} else {
			// Parse metadata from JSON column
			const metadataValue = row[getColumnName("apikey", "metadata")];
			if (typeof metadataValue === "string") {
				metadata = JSON.parse(metadataValue);
			} else {
				metadata = metadataValue as ApiKeyMetadata;
			}
		}

		return { id, keyHash, metadata };
	};

	// Transform audit log for database insertion
	const transformAuditLogInput = (log: AuditLog): Record<string, unknown> => {
		const transformed: Record<string, unknown> = {};

		transformed[getColumnName("auditlog", "id")] = log.id;
		transformed[getColumnName("auditlog", "keyId")] = log.keyId;
		transformed[getColumnName("auditlog", "ownerId")] = log.ownerId;
		transformed[getColumnName("auditlog", "action")] = log.action;
		
		// Timestamp handling
		transformed[getColumnName("auditlog", "timestamp")] = log.timestamp;

		// Store optional data field
		if (log.data) {
			const dataCol = getColumnName("auditlog", "data");
			if (config.supportsJSON) {
				transformed[dataCol] = log.data;
			} else {
				transformed[dataCol] = JSON.stringify(log.data);
			}
		}

		return transformed;
	};

	const transformAuditLogOutput = (row: Record<string, unknown>): AuditLog => {
		const log: AuditLog = {
			id: String(row[getColumnName("auditlog", "id")]),
			keyId: String(row[getColumnName("auditlog", "keyId")]),
			ownerId: String(row[getColumnName("auditlog", "ownerId")]),
			action: row[getColumnName("auditlog", "action")] as AuditAction,
			timestamp: String(row[getColumnName("auditlog", "timestamp")]),
		};

		const data = row[getColumnName("auditlog", "data")];
		if (data) {
			if (typeof data === "string") {
				log.data = JSON.parse(data);
			} else {
				log.data = data as Record<string, unknown>;
			}
		}

		return log;
	};

	// Create adapter context
	const context: AdapterContext = {
		config,
		schema,
		debugLog,
		getColumnName,
		getTableName,
		transformApiKeyInput,
		transformApiKeyOutput,
		transformAuditLogInput,
		transformAuditLogOutput,
	};

	// Get the base adapter implementation
	const baseAdapter = options.adapter(context);

	// Wrap methods with transformations and logging
	const wrappedAdapter: Storage = {
		async save(record: ApiKeyRecord): Promise<void> {
			debugLog("save", "Input:", record);

			// Generate ID if needed
			if (!record.id && !config.disableIdGeneration) {
				record.id = config.customIdGenerator ? config.customIdGenerator() : generateKey();
			}

			await baseAdapter.save(record);
			debugLog("save", "Saved successfully");
		},

		async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
			debugLog("findByHash", "Hash:", keyHash);
			const result = await baseAdapter.findByHash(keyHash);
			debugLog("findByHash", "Result:", result);
			return result;
		},

		async findById(id: string): Promise<ApiKeyRecord | null> {
			debugLog("findById", "ID:", id);
			const result = await baseAdapter.findById(id);
			debugLog("findById", "Result:", result);
			return result;
		},

		async findByOwner(ownerId: string): Promise<ApiKeyRecord[]> {
			debugLog("findByOwner", "Owner ID:", ownerId);
			const result = await baseAdapter.findByOwner(ownerId);
			debugLog("findByOwner", "Found:", result.length, "keys");
			return result;
		},

		async findByTags(tags: string[], ownerId?: string): Promise<ApiKeyRecord[]> {
			debugLog("findByTags", "Tags:", tags, "Owner ID:", ownerId);
			const result = await baseAdapter.findByTags(tags, ownerId);
			debugLog("findByTags", "Found:", result.length, "keys");
			return result;
		},

		async findByTag(tag: string, ownerId?: string): Promise<ApiKeyRecord[]> {
			debugLog("findByTag", "Tag:", tag, "Owner ID:", ownerId);
			const result = await baseAdapter.findByTag(tag, ownerId);
			debugLog("findByTag", "Found:", result.length, "keys");
			return result;
		},

		async updateMetadata(id: string, metadata: Partial<ApiKeyMetadata>): Promise<void> {
			debugLog("updateMetadata", "ID:", id, "Metadata:", metadata);
			await baseAdapter.updateMetadata(id, metadata);
			debugLog("updateMetadata", "Updated successfully");
		},

		async delete(id: string): Promise<void> {
			debugLog("delete", "ID:", id);
			await baseAdapter.delete(id);
			debugLog("delete", "Deleted successfully");
		},

		async deleteByOwner(ownerId: string): Promise<void> {
			debugLog("deleteByOwner", "Owner ID:", ownerId);
			await baseAdapter.deleteByOwner(ownerId);
			debugLog("deleteByOwner", "Deleted successfully");
		},

		// Optional audit log methods
		...(baseAdapter.saveLog && {
			async saveLog(log: AuditLog): Promise<void> {
				debugLog("saveLog", "Log:", log);
				await baseAdapter.saveLog!(log);
				debugLog("saveLog", "Saved successfully");
			},
		}),

		...(baseAdapter.findLogs && {
			async findLogs(query: AuditLogQuery): Promise<AuditLog[]> {
				debugLog("findLogs", "Query:", query);
				const result = await baseAdapter.findLogs!(query);
				debugLog("findLogs", "Found:", result.length, "logs");
				return result;
			},
		}),

		...(baseAdapter.countLogs && {
			async countLogs(query: AuditLogQuery): Promise<number> {
				debugLog("countLogs", "Query:", query);
				const result = await baseAdapter.countLogs!(query);
				debugLog("countLogs", "Count:", result);
				return result;
			},
		}),

		...(baseAdapter.deleteLogs && {
			async deleteLogs(query: AuditLogQuery): Promise<number> {
				debugLog("deleteLogs", "Query:", query);
				const result = await baseAdapter.deleteLogs!(query);
				debugLog("deleteLogs", "Deleted:", result, "logs");
				return result;
			},
		}),

		...(baseAdapter.getLogStats && {
			async getLogStats(ownerId: string): Promise<AuditLogStats> {
				debugLog("getLogStats", "Owner ID:", ownerId);
				const result = await baseAdapter.getLogStats!(ownerId);
				debugLog("getLogStats", "Stats:", result);
				return result;
			},
		}),
	};

	return wrappedAdapter;
};

