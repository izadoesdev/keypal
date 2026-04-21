import type { ApiKeyMutableFields, ApiKeyRecord } from "../../types/api-key-types";
import type {
	AuditLog,
	AuditLogQuery,
	AuditLogStats,
	AuditAction,
} from "../../types/audit-log-types";
import type { Storage } from "../../types/storage-types";
import { generateKey } from "../../core/generate";
import { logger } from "../../utils/logger";
import type {
	AdapterFactoryConfig,
	AdapterFactoryOptions,
	AdapterContext,
	SchemaConfig,
} from "./types";

export * from "./types";
export { DEFAULT_QUERY_LIMIT, calculateLogStats } from "../utils";

const MUTABLE_FIELDS = [
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
	"enabled",
	"rotatedTo",
] as const;

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

	const getTableName = (table: "apikey" | "auditlog"): string => {
		return table === "apikey" ? schema.apiKeyTable! : schema.auditLogTable!;
	};

	const getColumnName = (
		table: "apikey" | "auditlog",
		field: string
	): string => {
		if (table === "apikey") {
			const mapping = schema.apiKeyColumns || {};

			if (mapping.metadataColumns && field in mapping.metadataColumns) {
				return mapping.metadataColumns[field] || field;
			}

			if (field === "id") return mapping.id || "id";
			if (field === "keyHash") return mapping.keyHash || "keyHash";
			if (field === "metadata") return mapping.metadata || "metadata";
		} else {
			const mapping = schema.auditLogColumns || {};
			return (mapping as Record<string, string>)[field] || field;
		}

		return field;
	};

	const transformApiKeyInput = (
		record: ApiKeyRecord
	): Record<string, unknown> => {
		const transformed: Record<string, unknown> = {};

		if (schema.flattenMetadata) {
			transformed[getColumnName("apikey", "id")] = record.id;
			transformed[getColumnName("apikey", "keyHash")] = record.keyHash;

			for (const field of MUTABLE_FIELDS) {
				const value = (record as Record<string, unknown>)[field];
				const colName = getColumnName("apikey", field);

				if (value === null || value === undefined) {
					transformed[colName] = null;
				} else if (typeof value === "object" && "toISOString" in value) {
					transformed[colName] = config.supportsDates
						? value
						: (value as Date).toISOString();
				} else if (typeof value === "object") {
					transformed[colName] = config.supportsJSON
						? value
						: JSON.stringify(value);
				} else if (typeof value === "boolean") {
					transformed[colName] = config.supportsBooleans ? value : value ? 1 : 0;
				} else {
					transformed[colName] = value;
				}
			}
		} else {
			transformed[getColumnName("apikey", "id")] = record.id;
			transformed[getColumnName("apikey", "keyHash")] = record.keyHash;

			const metadata: Record<string, unknown> = {};
			for (const field of MUTABLE_FIELDS) {
				const value = (record as Record<string, unknown>)[field];
				if (value !== undefined) {
					metadata[field] = value;
				}
			}

			if (config.supportsJSON) {
				transformed[getColumnName("apikey", "metadata")] = metadata;
			} else {
				transformed[getColumnName("apikey", "metadata")] =
					JSON.stringify(metadata);
			}
		}

		return transformed;
	};

	const transformApiKeyOutput = (
		row: Record<string, unknown>
	): ApiKeyRecord => {
		const id = String(row[getColumnName("apikey", "id")]);
		const keyHash = String(row[getColumnName("apikey", "keyHash")]);

		const record: Record<string, unknown> = { id, keyHash };

		if (schema.flattenMetadata) {
			for (const field of MUTABLE_FIELDS) {
				const colName = getColumnName("apikey", field);
				const value = row[colName];

				if (value !== undefined && value !== null) {
					if (
						(field === "scopes" ||
							field === "resources" ||
							field === "tags" ||
							field === "allowedIps" ||
							field === "allowedOrigins" ||
							field === "rateLimit") &&
						typeof value === "string" &&
						!config.supportsJSON
					) {
						record[field] = JSON.parse(value);
					} else {
						record[field] = value;
					}
				}
			}
		} else {
			const metadataValue = row[getColumnName("apikey", "metadata")];
			const metadata =
				typeof metadataValue === "string"
					? JSON.parse(metadataValue)
					: (metadataValue as Record<string, unknown>);

			if (metadata) {
				for (const [key, value] of Object.entries(metadata)) {
					if (value !== undefined) {
						record[key] = value;
					}
				}
			}
		}

		return record as unknown as ApiKeyRecord;
	};

	const transformAuditLogInput = (log: AuditLog): Record<string, unknown> => {
		const transformed: Record<string, unknown> = {};

		transformed[getColumnName("auditlog", "id")] = log.id;
		transformed[getColumnName("auditlog", "keyId")] = log.keyId;
		transformed[getColumnName("auditlog", "ownerId")] = log.ownerId;
		transformed[getColumnName("auditlog", "action")] = log.action;
		transformed[getColumnName("auditlog", "timestamp")] = log.timestamp;

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

	const transformAuditLogOutput = (
		row: Record<string, unknown>
	): AuditLog => {
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

	const baseAdapter = options.adapter(context);

	const wrappedAdapter: Storage = {
		async save(record: ApiKeyRecord): Promise<void> {
			debugLog("save", "Input:", record);

			if (!record.id && !config.disableIdGeneration) {
				record.id = config.customIdGenerator
					? config.customIdGenerator()
					: generateKey();
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

		async findByTags(
			tags: string[],
			ownerId?: string
		): Promise<ApiKeyRecord[]> {
			debugLog("findByTags", "Tags:", tags, "Owner ID:", ownerId);
			const result = await baseAdapter.findByTags(tags, ownerId);
			debugLog("findByTags", "Found:", result.length, "keys");
			return result;
		},

		async findByTag(
			tag: string,
			ownerId?: string
		): Promise<ApiKeyRecord[]> {
			debugLog("findByTag", "Tag:", tag, "Owner ID:", ownerId);
			const result = await baseAdapter.findByTag(tag, ownerId);
			debugLog("findByTag", "Found:", result.length, "keys");
			return result;
		},

		async update(
			id: string,
			fields: Partial<ApiKeyMutableFields>
		): Promise<void> {
			debugLog("update", "ID:", id, "Fields:", fields);
			await baseAdapter.update(id, fields);
			debugLog("update", "Updated successfully");
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
