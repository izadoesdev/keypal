import { sql, type Kysely } from "kysely";
import type { ApiKeyMetadata, ApiKeyRecord } from "../types/api-key-types";
import type {
	AuditLog,
	AuditLogQuery,
	AuditLogStats,
} from "../types/audit-log-types";
import type { Storage } from "../types/storage-types";
import {
	createAdapterFactory,
	type SchemaConfig,
} from "./adapter-factory";

/**
 * Generic Kysely database interface
 * Supports any Kysely database with any schema
 */
export interface KyselyDB {
	// biome-ignore lint/suspicious/noExplicitAny: Support any Kysely schema
	[key: string]: any;
}

/**
 * Configuration for Kysely adapter
 */
export interface KyselyAdapterConfig {
	/**
	 * The Kysely database instance
	 * Supports PostgreSQL, MySQL, SQLite, and other Kysely dialects
	 */
	db: Kysely<KyselyDB>;

	/**
	 * Table name for API keys
	 */
	table: string;

	/**
	 * The database provider
	 * Used for provider-specific optimizations
	 */
	provider?: "pg" | "mysql" | "sqlite" | "mssql";

	/**
	 * Schema configuration for custom column names and flattened metadata
	 */
	schema?: SchemaConfig;

	/**
	 * Optional table for audit logs
	 */
	auditLogTable?: string;

	/**
	 * Enable debug logging
	 * @default false
	 */
	debugLogs?: boolean;

	/**
	 * Validate table structure on initialization
	 * @default false
	 */
	validate?: boolean;

	/**
	 * Enable transaction support
	 * @default false
	 */
	transaction?: boolean;
}

/**
 * Storage adapter for API keys using Kysely Query Builder
 *
 * **Supports:**
 * - PostgreSQL, MySQL, SQLite, SQL Server
 * - Custom column names
 * - Custom table names  
 * - Flattened metadata schema
 * - JSON/JSONB columns
 * - Audit logging
 * - Transactions
 *
 * **Required Table Columns (default schema):**
 * - `id`: TEXT PRIMARY KEY
 * - `key_hash`: TEXT (or `keyHash` in camelCase)
 * - `metadata`: JSONB (PostgreSQL) or TEXT (others)
 *
 * You can customize column names and flatten metadata into separate columns.
 *
 * @example
 * ```typescript
 * // PostgreSQL with default schema
 * import { KyselyStore } from 'keypal/kysely';
 * import { Kysely, PostgresDialect } from 'kysely';
 * import { Pool } from 'pg';
 *
 * const db = new Kysely({ dialect: new PostgresDialect({ pool: new Pool(...) }) });
 * const store = new KyselyStore({ db, table: 'apikey', provider: 'pg' });
 * 
 * // MySQL with custom column names
 * const store = new KyselyStore({ 
 *   db, 
 *   table: 'api_keys',
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
 * const store = new KyselyStore({ 
 *   db, 
 *   table: 'apikey',
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
export class KyselyStore implements Storage {
	private readonly storage: Storage;
	private readonly config: KyselyAdapterConfig;

	constructor(options: KyselyAdapterConfig) {
		this.config = options;

		// Validate table structure if requested
		if (options.validate) {
			this.validateTableStructure();
		}

		// Detect provider if not specified
		const provider = options.provider || this.detectProvider(options.db);

		// Warn about provider-specific limitations
		if (provider === "sqlite") {
			console.warn(
				"[Kysely Store] SQLite detected: JSON queries use TEXT storage, not native JSON"
			);
		}

		this.storage = createAdapterFactory({
			config: {
				adapterId: "kysely",
				adapterName: "Kysely Query Builder",
				supportsJSON: provider === "pg", // Only PostgreSQL has native JSONB
				supportsDates: true,
				supportsBooleans: true,
				debugLogs: options.debugLogs,
			},
			schema: options.schema,
			adapter: (context) => {
				const { transformApiKeyInput, transformApiKeyOutput } = context;
				const db = options.db;
				const table = options.table;

				// Helper to check required fields
				const checkMissingFields = (
					data: Record<string, unknown>,
					operation: string
				) => {
					const requiredFields = ["id", "keyHash"];
					for (const field of requiredFields) {
						if (!(field in data) && operation === "save") {
							throw new Error(
								`Missing required field "${field}" in ${operation} operation`
							);
						}
					}
				};

				return {
					async save(record: ApiKeyRecord): Promise<void> {
						checkMissingFields(record, "save");
						const row = transformApiKeyInput(record);
						await db.insertInto(table).values(row).execute();
					},

					async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
						const keyHashCol = context.getColumnName("apikey", "keyHash");
						const result = await db
							.selectFrom(table)
							.selectAll()
							.where(keyHashCol, "=", keyHash)
							.limit(1)
							.executeTakeFirst();

						return result ? transformApiKeyOutput(result) : null;
					},

					async findById(id: string): Promise<ApiKeyRecord | null> {
						const idCol = context.getColumnName("apikey", "id");
						const result = await db
							.selectFrom(table)
							.selectAll()
							.where(idCol, "=", id)
							.limit(1)
							.executeTakeFirst();

						return result ? transformApiKeyOutput(result) : null;
					},

					async findByOwner(ownerId: string): Promise<ApiKeyRecord[]> {
						if (context.schema.flattenMetadata) {
							const ownerCol = context.getColumnName("apikey", "ownerId");
							const results = await db
								.selectFrom(table)
								.selectAll()
								.where(ownerCol, "=", ownerId)
								.execute();
							return results.map(transformApiKeyOutput);
						}

						// For PostgreSQL JSONB
						if (provider === "pg") {
							const metadataCol = context.getColumnName("apikey", "metadata");
							const results = await db
								.selectFrom(table)
								.selectAll()
								.where(
									sql<boolean>`${sql.ref(metadataCol)} @> ${JSON.stringify({ ownerId })}`
								)
								.execute();
							return results.map(transformApiKeyOutput);
						}

						// For other databases, fetch all and filter (less efficient)
						const results = await db.selectFrom(table).selectAll().execute();
						return results
							.map(transformApiKeyOutput)
							.filter((record) => record.metadata.ownerId === ownerId);
					},

					async findByTags(
						tags: string[],
						ownerId?: string
					): Promise<ApiKeyRecord[]> {
						if (tags.length === 0) {
							return [];
						}

						const lowercasedTags = tags.map((t) => t.toLowerCase());

						if (context.schema.flattenMetadata) {
							const tagsCol = context.getColumnName("apikey", "tags");
							let query = db.selectFrom(table).selectAll();

							// Build tag conditions for flattened schema
							// Note: This depends on how tags are stored in the flattened column
							// For JSON arrays, we'd need JSON contains operations

							if (ownerId !== undefined) {
								const ownerCol = context.getColumnName("apikey", "ownerId");
								query = query.where(ownerCol, "=", ownerId);
							}

							const results = await query.execute();
							return results
								.map(transformApiKeyOutput)
								.filter((record) => {
									const recordTags = record.metadata.tags || [];
									return lowercasedTags.some((tag) => recordTags.includes(tag));
								});
						}

						// For PostgreSQL JSONB
						if (provider === "pg") {
							const metadataCol = context.getColumnName("apikey", "metadata");
							let query = db.selectFrom(table).selectAll();

							// Build tag conditions (OR logic)
							const tagConditions = lowercasedTags.map((tag) =>
								sql<boolean>`${sql.ref(metadataCol)} @> ${JSON.stringify({ tags: [tag] })}`
							);

							// biome-ignore lint/suspicious/noExplicitAny: Kysely or types are complex
							query = query.where(({ or }: any) => or(tagConditions));

							// Add owner filter (AND logic)
							if (ownerId !== undefined) {
								query = query.where(
									sql<boolean>`${sql.ref(metadataCol)} @> ${JSON.stringify({ ownerId })}`
								);
							}

							const results = await query.execute();
							return results.map(transformApiKeyOutput);
						}

						// For other databases, fetch all and filter
						const results = await db.selectFrom(table).selectAll().execute();
						return results
							.map(transformApiKeyOutput)
							.filter((record) => {
								const recordTags = record.metadata.tags || [];
								const hasTag = lowercasedTags.some((tag) =>
									recordTags.includes(tag)
								);
								const matchesOwner =
									ownerId === undefined || record.metadata.ownerId === ownerId;
								return hasTag && matchesOwner;
							});
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
							// Update only changed columns
							const updates: Record<string, unknown> = {};
							for (const [key] of Object.entries(metadata)) {
								const colName = context.getColumnName("apikey", key);
								updates[colName] = (row as Record<string, unknown>)[colName];
							}
							await db
								.updateTable(table)
								.set(updates)
								.where(idCol, "=", id)
								.execute();
						} else {
							const metadataCol = context.getColumnName("apikey", "metadata");
							await db
								.updateTable(table)
								.set({ [metadataCol]: updated })
								.where(idCol, "=", id)
								.execute();
						}
					},

					async delete(id: string): Promise<void> {
						const idCol = context.getColumnName("apikey", "id");
						await db.deleteFrom(table).where(idCol, "=", id).execute();
					},

					async deleteByOwner(ownerId: string): Promise<void> {
						if (context.schema.flattenMetadata) {
							const ownerCol = context.getColumnName("apikey", "ownerId");
							await db.deleteFrom(table).where(ownerCol, "=", ownerId).execute();
						} else if (provider === "pg") {
							const metadataCol = context.getColumnName("apikey", "metadata");
							await db
								.deleteFrom(table)
								.where(
									sql<boolean>`${sql.ref(metadataCol)} @> ${JSON.stringify({ ownerId })}`
								)
								.execute();
						} else {
							// For other databases, find then delete
							const records = await this.findByOwner(ownerId);
							const idCol = context.getColumnName("apikey", "id");
							if (records.length > 0) {
								await db
									.deleteFrom(table)
									.where(
										idCol,
										"in",
										records.map((r) => r.id)
									)
									.execute();
							}
						}
					},

					// Audit log methods (if audit table provided)
					...(options.auditLogTable &&
						context.transformAuditLogInput && {
							async saveLog(log: AuditLog): Promise<void> {
								const row = context.transformAuditLogInput!(log);
								await db.insertInto(options.auditLogTable!).values(row).execute();
							},

							async findLogs(query: AuditLogQuery): Promise<AuditLog[]> {
								const auditTable = options.auditLogTable!;
								let auditQuery = db.selectFrom(auditTable).selectAll();

								if (query.keyId) {
									const col = context.getColumnName("auditlog", "keyId");
									auditQuery = auditQuery.where(col, "=", query.keyId);
								}

								if (query.ownerId) {
									const col = context.getColumnName("auditlog", "ownerId");
									auditQuery = auditQuery.where(col, "=", query.ownerId);
								}

								if (query.action) {
									const col = context.getColumnName("auditlog", "action");
									auditQuery = auditQuery.where(col, "=", query.action);
								}

								const timestampCol = context.getColumnName("auditlog", "timestamp");
								const results = await auditQuery
									.orderBy(timestampCol, "desc")
									.offset(query.offset ?? 0)
									// biome-ignore lint/style/noMagicNumbers: Default limit
									.limit(query.limit ?? 100)
									.execute();

								return results.map(
									(row: Record<string, unknown>) =>
										context.transformAuditLogOutput?.(row)!
								);
							},

							async countLogs(query: AuditLogQuery): Promise<number> {
								const auditTable = options.auditLogTable!;
								let auditQuery = db
									.selectFrom(auditTable)
									.select(({ fn }) => fn.countAll().as("count"));

								if (query.keyId) {
									const col = context.getColumnName("auditlog", "keyId");
									auditQuery = auditQuery.where(col, "=", query.keyId);
								}

								if (query.ownerId) {
									const col = context.getColumnName("auditlog", "ownerId");
									auditQuery = auditQuery.where(col, "=", query.ownerId);
								}

								if (query.action) {
									const col = context.getColumnName("auditlog", "action");
									auditQuery = auditQuery.where(col, "=", query.action);
								}

								const result = await auditQuery.executeTakeFirst();
								return Number(result?.count || 0);
							},

							async deleteLogs(query: AuditLogQuery): Promise<number> {
								const auditTable = options.auditLogTable!;

								if (
									!query.keyId &&
									!query.ownerId &&
									!query.action
								) {
									return 0;
								}

								let deleteQuery = db.deleteFrom(auditTable);

								if (query.keyId) {
									const col = context.getColumnName("auditlog", "keyId");
									deleteQuery = deleteQuery.where(col, "=", query.keyId);
								}

								if (query.ownerId) {
									const col = context.getColumnName("auditlog", "ownerId");
									deleteQuery = deleteQuery.where(col, "=", query.ownerId);
								}

								if (query.action) {
									const col = context.getColumnName("auditlog", "action");
									deleteQuery = deleteQuery.where(col, "=", query.action);
								}

								const result = await deleteQuery.executeTakeFirst();
								return Number(result.numDeletedRows || 0);
							},

							async getLogStats(ownerId: string): Promise<AuditLogStats> {
								const auditTable = options.auditLogTable!;
								const col = context.getColumnName("auditlog", "ownerId");
								const results = await db
									.selectFrom(auditTable)
									.selectAll()
									.where(col, "=", ownerId)
									.execute();

								const logs = results.map(
									(row: Record<string, unknown>) =>
										context.transformAuditLogOutput?.(row)!
								);

								const byAction: Partial<Record<string, number>> = {};
								let lastActivity: string | null = null;

								for (const log of logs) {
									byAction[log.action] = (byAction[log.action] || 0) + 1;
									if (!lastActivity || log.timestamp > lastActivity) {
										lastActivity = log.timestamp;
									}
								}

								return {
									total: logs.length,
									byAction,
									lastActivity,
								};
							},
						}),
				};
			},
		});
	}

	// Delegate all methods to the wrapped storage
	async save(record: ApiKeyRecord): Promise<void> {
		return this.storage.save(record);
	}

	async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
		return this.storage.findByHash(keyHash);
	}

	async findById(id: string): Promise<ApiKeyRecord | null> {
		return this.storage.findById(id);
	}

	async findByOwner(ownerId: string): Promise<ApiKeyRecord[]> {
		return this.storage.findByOwner(ownerId);
	}

	async findByTags(tags: string[], ownerId?: string): Promise<ApiKeyRecord[]> {
		return this.storage.findByTags(tags, ownerId);
	}

	async findByTag(tag: string, ownerId?: string): Promise<ApiKeyRecord[]> {
		return this.storage.findByTag(tag, ownerId);
	}

	async updateMetadata(
		id: string,
		metadata: Partial<ApiKeyMetadata>
	): Promise<void> {
		return this.storage.updateMetadata(id, metadata);
	}

	async delete(id: string): Promise<void> {
		return this.storage.delete(id);
	}

	async deleteByOwner(ownerId: string): Promise<void> {
		return this.storage.deleteByOwner(ownerId);
	}

	// Optional audit log methods
	async saveLog(log: AuditLog): Promise<void> {
		if (this.storage.saveLog) {
			return this.storage.saveLog(log);
		}
	}

	async findLogs(query: AuditLogQuery): Promise<AuditLog[]> {
		if (this.storage.findLogs) {
			return this.storage.findLogs(query);
		}
		return [];
	}

	async countLogs(query: AuditLogQuery): Promise<number> {
		if (this.storage.countLogs) {
			return this.storage.countLogs(query);
		}
		return 0;
	}

	async deleteLogs(query: AuditLogQuery): Promise<number> {
		if (this.storage.deleteLogs) {
			return this.storage.deleteLogs(query);
		}
		return 0;
	}

	async getLogStats(ownerId: string): Promise<AuditLogStats> {
		if (this.storage.getLogStats) {
			return this.storage.getLogStats(ownerId);
		}
		return {
			total: 0,
			byAction: {},
			lastActivity: null,
		};
	}

	/**
	 * Detect the database provider from the DB instance
	 * @private
	 */
	private detectProvider(db: Kysely<KyselyDB>): "pg" | "mysql" | "sqlite" | "mssql" {
		// Try to detect from the executor or dialect
		const executorName = db.getExecutor?.()?.constructor?.name || "";
		const dialectName = String(executorName).toLowerCase();

		if (dialectName.includes("postgres") || dialectName.includes("pg")) {
			return "pg";
		}
		if (dialectName.includes("mysql") || dialectName.includes("maria")) {
			return "mysql";
		}
		if (dialectName.includes("sqlite")) {
			return "sqlite";
		}
		if (dialectName.includes("mssql") || dialectName.includes("sqlserver")) {
			return "mssql";
		}

		// Default to PostgreSQL
		console.warn(
			"[Kysely Store] Could not detect database provider, defaulting to PostgreSQL"
		);
		return "pg";
	}

	/**
	 * Validate that the table has required columns
	 * Note: Runtime validation for Kysely is limited
	 * @private
	 */
	private validateTableStructure() {
		console.warn(
			`[Kysely Store] Validation enabled for table "${this.config.table}". ` +
				`Make sure your table includes: id, keyHash (or key_hash), and metadata columns.`
		);
	}
}
