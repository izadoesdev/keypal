import { and, arrayContains, eq, or } from "drizzle-orm";
import type { ApiKeyMetadata, ApiKeyRecord } from "../types/api-key-types";
import type {
	AuditLog,
	AuditLogQuery,
	AuditLogStats,
} from "../types/audit-log-types";
import type { Storage } from "../types/storage-types";
import { logger } from "../utils/logger";
import {
	createAdapterFactory,
	type SchemaConfig,
} from "./adapter-factory";
import { DEFAULT_QUERY_LIMIT, calculateLogStats } from "./utils";

/**
 * Generic database interface for Drizzle
 * Supports any Drizzle database type (PostgreSQL, MySQL, SQLite)
 */
export interface DrizzleDB {
	// biome-ignore lint/suspicious/noExplicitAny: Support any Drizzle schema
	[key: string]: any;
}

/**
 * Generic table interface for Drizzle
 */
export interface DrizzleTable {
	// biome-ignore lint/suspicious/noExplicitAny: Support any Drizzle table structure
	[key: string]: any;
}

/**
 * Configuration for Drizzle adapter
 */
export interface DrizzleAdapterConfig {
	/**
	 * The Drizzle database instance
	 * Supports PostgreSQL, MySQL, and SQLite
	 */
	db: DrizzleDB;

	/**
	 * The table for API keys
	 */
	table: DrizzleTable;

	/**
	 * The database provider
	 * Used for provider-specific optimizations
	 */
	provider?: "pg" | "mysql" | "sqlite";

	/**
	 * Schema configuration for custom column names and flattened metadata
	 */
	schema?: SchemaConfig;

	/**
	 * Optional table for audit logs
	 */
	auditLogTable?: DrizzleTable;

	/**
	 * Enable debug logging
	 * @default false
	 */
	debugLogs?: boolean;
}

type DatabaseProvider = "pg" | "mysql" | "sqlite";

/**
 * Detect the database provider from the DB instance
 */
function detectProvider(db: DrizzleDB): DatabaseProvider {
	const dbName = db.constructor?.name || "";

	if (dbName.includes("Pg") || dbName.includes("Postgres")) {
		return "pg";
	}
	if (dbName.includes("MySQL") || dbName.includes("Maria")) {
		return "mysql";
	}
	if (dbName.includes("SQLite") || dbName.includes("Sqlite")) {
		return "sqlite";
	}

	logger.warn(
		"[Drizzle Store] Could not detect database provider, defaulting to PostgreSQL"
	);
	return "pg";
}

/**
 * Create a Drizzle storage adapter for API keys
 *
 * **Supports:**
 * - PostgreSQL, MySQL, and SQLite
 * - Custom column names
 * - Custom table names  
 * - Flattened metadata schema
 * - JSON/JSONB columns
 * - Audit logging
 *
 * **Required Table Columns (default schema):**
 * - `id`: TEXT PRIMARY KEY
 * - `keyHash`: TEXT
 * - `metadata`: JSONB (or TEXT for MySQL/SQLite)
 *
 * @example
 * ```typescript
 * // Default schema (PostgreSQL)
 * import { createDrizzleStore } from 'keypal/drizzle';
 * import { apikey } from 'keypal/drizzle/schema';
 * const store = createDrizzleStore({ db, table: apikey, provider: 'pg' });
 * 
 * // MySQL with custom column names
 * const store = createDrizzleStore({ 
 *   db, 
 *   table: customTable,
 *   provider: 'mysql',
 *   schema: {
 *     apiKeyColumns: {
 *       id: 'key_id',
 *       keyHash: 'key_hash',
 *       metadata: 'key_metadata'
 *     }
 *   }
 * });
 * 
 * // SQLite with flattened metadata
 * const store = createDrizzleStore({ 
 *   db, 
 *   table: flatTable,
 *   provider: 'sqlite',
 *   schema: {
 *     flattenMetadata: true,
 *     apiKeyColumns: {
 *       metadataColumns: {
 *         ownerId: 'owner_id',
 *         name: 'key_name',
 *         scopes: 'key_scopes'
 *       }
 *     }
 *   }
 * });
 * ```
 */
export function createDrizzleStore(options: DrizzleAdapterConfig): Storage {
	const { db, table, auditLogTable } = options;
	const provider = options.provider ?? detectProvider(db);

	if (provider === "mysql" && auditLogTable) {
		logger.warn(
			"[Drizzle Store] MySQL detected: RETURNING clause not supported, using fallback queries"
		);
	}

	return createAdapterFactory({
		config: {
			adapterId: "drizzle",
			adapterName: "Drizzle ORM",
			supportsJSON: provider !== "sqlite",
			supportsDates: true,
			supportsBooleans: true,
			debugLogs: options.debugLogs,
		},
		schema: options.schema,
		adapter: (context) => {
			const { transformApiKeyInput, transformApiKeyOutput } = context;

			return {
				async save(record: ApiKeyRecord): Promise<void> {
					const row = transformApiKeyInput(record);
					await db.insert(table).values(row);
				},

				async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
					const keyHashCol = context.getColumnName("apikey", "keyHash");
					const rows = await db
						.select()
						.from(table)
						.where(eq(table[keyHashCol], keyHash))
						.limit(1);

					return rows.length > 0 && rows[0]
						? transformApiKeyOutput(rows[0])
						: null;
				},

				async findById(id: string): Promise<ApiKeyRecord | null> {
					const idCol = context.getColumnName("apikey", "id");
					const rows = await db
						.select()
						.from(table)
						.where(eq(table[idCol], id))
						.limit(1);

					return rows.length > 0 && rows[0]
						? transformApiKeyOutput(rows[0])
						: null;
				},

				async findByOwner(ownerId: string): Promise<ApiKeyRecord[]> {
					let rows: Record<string, unknown>[];

					if (context.schema.flattenMetadata) {
						const ownerCol = context.getColumnName("apikey", "ownerId");
						rows = await db
							.select()
							.from(table)
							.where(eq(table[ownerCol], ownerId));
					} else {
						const metadataCol = context.getColumnName("apikey", "metadata");
						rows = await db
							.select()
							.from(table)
							.where(arrayContains(table[metadataCol], { ownerId }));
					}

					return rows.map(transformApiKeyOutput);
				},

				async findByTags(
					tags: string[],
					ownerId?: string
				): Promise<ApiKeyRecord[]> {
					// biome-ignore lint/suspicious/noExplicitAny: arrayContains returns SQL[], TypeScript incorrectly infers undefined
					const conditions: any = [];

					if (context.schema.flattenMetadata) {
						const tagsCol = context.getColumnName("apikey", "tags");
						const lowercasedTags = tags.map((t) => t.toLowerCase());

						for (const tag of lowercasedTags) {
							conditions.push(arrayContains(table[tagsCol], [tag]));
						}

						if (ownerId !== undefined) {
							const ownerCol = context.getColumnName("apikey", "ownerId");
							conditions.push(eq(table[ownerCol], ownerId));
						}
					} else {
						const metadataCol = context.getColumnName("apikey", "metadata");
						if (tags.length > 0) {
							const lowercasedTags = tags.map((t) => t.toLowerCase());
							const tagConditions = lowercasedTags.map((tag) =>
								arrayContains(table[metadataCol], { tags: [tag] })
							);
							conditions.push(or(...tagConditions));
						}

						if (ownerId !== undefined) {
							conditions.push(
								arrayContains(table[metadataCol], { ownerId })
							);
						}
					}

					if (conditions.length === 0) {
						return [];
					}

					const rows = await db
						.select()
						.from(table)
						.where(and(...conditions));

					return rows.map(transformApiKeyOutput);
				},

				async findByTag(tag: string, ownerId?: string): Promise<ApiKeyRecord[]> {
					return this.findByTags([tag], ownerId);
				},

				async updateMetadata(
					id: string,
					metadata: Partial<ApiKeyMetadata>
				): Promise<void> {
					const existing = await this.findById(id);
					if (!existing) {
						throw new Error(`API key with id ${id} not found`);
					}

					const updated = { ...existing.metadata, ...metadata };
					const updatedRecord = { ...existing, metadata: updated };
					const row = transformApiKeyInput(updatedRecord);
					const idCol = context.getColumnName("apikey", "id");

					if (context.schema.flattenMetadata) {
						const updates: Record<string, unknown> = {};
						for (const [key] of Object.entries(metadata)) {
							const colName = context.getColumnName("apikey", key);
							updates[colName] = (row as Record<string, unknown>)[colName];
						}
						await db
							.update(table)
							.set(updates)
							.where(eq(table[idCol], id));
					} else {
						const metadataCol = context.getColumnName("apikey", "metadata");
						await db
							.update(table)
							.set({ [metadataCol]: updated })
							.where(eq(table[idCol], id));
					}
				},

				async delete(id: string): Promise<void> {
					const idCol = context.getColumnName("apikey", "id");
					await db.delete(table).where(eq(table[idCol], id));
				},

				async deleteByOwner(ownerId: string): Promise<void> {
					if (context.schema.flattenMetadata) {
						const ownerCol = context.getColumnName("apikey", "ownerId");
						await db.delete(table).where(eq(table[ownerCol], ownerId));
					} else {
						const metadataCol = context.getColumnName("apikey", "metadata");
						await db
							.delete(table)
							.where(arrayContains(table[metadataCol], { ownerId }));
					}
				},

				...(auditLogTable &&
					context.transformAuditLogInput && {
						async saveLog(log: AuditLog): Promise<void> {
							const row = context.transformAuditLogInput!(log);
							await db
								.insert(auditLogTable)
								.values(row as Record<string, unknown>);
						},

						async findLogs(query: AuditLogQuery): Promise<AuditLog[]> {
							// biome-ignore lint/suspicious/noExplicitAny: Multiple condition types
							const conditions: any = [];

							if (query.keyId) {
								const col = context.getColumnName("auditlog", "keyId");
								conditions.push(eq(auditLogTable[col], query.keyId));
							}

							if (query.ownerId) {
								const col = context.getColumnName("auditlog", "ownerId");
								conditions.push(eq(auditLogTable[col], query.ownerId));
							}

							if (query.action) {
								const col = context.getColumnName("auditlog", "action");
								conditions.push(eq(auditLogTable[col], query.action));
							}

							let auditQuery = db.select().from(auditLogTable);

							if (conditions.length > 0) {
								// biome-ignore lint/suspicious/noExplicitAny: Drizzle typing issue
								auditQuery = auditQuery.where(and(...conditions)) as any;
							}

							const offset = query.offset ?? 0;
							const limit = query.limit ?? DEFAULT_QUERY_LIMIT;

							const timestampCol = context.getColumnName("auditlog", "timestamp");
							const rows = await auditQuery
								.orderBy(auditLogTable[timestampCol])
								.limit(limit)
								.offset(offset);

							return rows.map(
								(row: Record<string, unknown>) =>
									context.transformAuditLogOutput?.(row)!
							);
						},

						async countLogs(query: AuditLogQuery): Promise<number> {
							// biome-ignore lint/suspicious/noExplicitAny: Multiple condition types
							const conditions: any = [];

							if (query.keyId) {
								const col = context.getColumnName("auditlog", "keyId");
								conditions.push(eq(auditLogTable[col], query.keyId));
							}

							if (query.ownerId) {
								const col = context.getColumnName("auditlog", "ownerId");
								conditions.push(eq(auditLogTable[col], query.ownerId));
							}

							if (query.action) {
								const col = context.getColumnName("auditlog", "action");
								conditions.push(eq(auditLogTable[col], query.action));
							}

							let auditQuery = db.select().from(auditLogTable);

							if (conditions.length > 0) {
								// biome-ignore lint/suspicious/noExplicitAny: Drizzle typing issue
								auditQuery = auditQuery.where(and(...conditions)) as any;
							}

							const rows = await auditQuery;
							return rows.length;
						},

						async deleteLogs(query: AuditLogQuery): Promise<number> {
							// biome-ignore lint/suspicious/noExplicitAny: Multiple condition types
							const conditions: any = [];

							if (query.keyId) {
								const col = context.getColumnName("auditlog", "keyId");
								conditions.push(eq(auditLogTable[col], query.keyId));
							}

							if (query.ownerId) {
								const col = context.getColumnName("auditlog", "ownerId");
								conditions.push(eq(auditLogTable[col], query.ownerId));
							}

							if (query.action) {
								const col = context.getColumnName("auditlog", "action");
								conditions.push(eq(auditLogTable[col], query.action));
							}

							if (conditions.length === 0) {
								return 0;
							}

							if (provider === "mysql") {
								const countQuery = await db
									.select()
									.from(auditLogTable)
									.where(and(...conditions));
								await db.delete(auditLogTable).where(and(...conditions));
								return countQuery.length;
							}

							// biome-ignore lint/suspicious/noExplicitAny: Drizzle typing issue
							const result = (await db
								.delete(auditLogTable)
								.where(and(...conditions))
								.returning()) as any;

							return Array.isArray(result) ? result.length : 0;
						},

						async getLogStats(ownerId: string): Promise<AuditLogStats> {
							const col = context.getColumnName("auditlog", "ownerId");
							const rows = await db
								.select()
								.from(auditLogTable)
								.where(eq(auditLogTable[col], ownerId));

							const logs = rows.map(
								(row: Record<string, unknown>) =>
									context.transformAuditLogOutput?.(row)!
							);

							return calculateLogStats(logs);
						},
					}),
			};
		},
	});
}

/**
 * Storage adapter class for Drizzle ORM
 * 
 * @example
 * ```typescript
 * const store = new DrizzleStore({ db, table: apikey, provider: 'pg' });
 * ```
 */
export class DrizzleStore implements Storage {
	private readonly storage: Storage;

	constructor(options: DrizzleAdapterConfig) {
		this.storage = createDrizzleStore(options);
	}

	save = (record: ApiKeyRecord) => this.storage.save(record);
	findByHash = (keyHash: string) => this.storage.findByHash(keyHash);
	findById = (id: string) => this.storage.findById(id);
	findByOwner = (ownerId: string) => this.storage.findByOwner(ownerId);
	findByTags = (tags: string[], ownerId?: string) => this.storage.findByTags(tags, ownerId);
	findByTag = (tag: string, ownerId?: string) => this.storage.findByTag(tag, ownerId);
	updateMetadata = (id: string, metadata: Partial<ApiKeyMetadata>) => this.storage.updateMetadata(id, metadata);
	delete = (id: string) => this.storage.delete(id);
	deleteByOwner = (ownerId: string) => this.storage.deleteByOwner(ownerId);
	saveLog = (log: AuditLog) => this.storage.saveLog?.(log) ?? Promise.resolve();
	findLogs = (query: AuditLogQuery) => this.storage.findLogs?.(query) ?? Promise.resolve([]);
	countLogs = (query: AuditLogQuery) => this.storage.countLogs?.(query) ?? Promise.resolve(0);
	deleteLogs = (query: AuditLogQuery) => this.storage.deleteLogs?.(query) ?? Promise.resolve(0);
	getLogStats = (ownerId: string) => this.storage.getLogStats?.(ownerId) ?? Promise.resolve({ total: 0, byAction: {}, lastActivity: null });
}
