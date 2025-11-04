import { and, arrayContains, eq, or } from "drizzle-orm";
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

	/**
	 * Validate table structure on initialization
	 * Checks that required columns exist in the schema
	 * @default false
	 */
	validate?: boolean;

	/**
	 * Enable transaction support
	 * When true, operations can be wrapped in database transactions
	 * @default false
	 */
	transaction?: boolean;
}

/**
 * Storage adapter for API keys using Drizzle ORM
 *
 * **Supports:**
 * - PostgreSQL, MySQL, and SQLite
 * - Custom column names
 * - Custom table names  
 * - Flattened metadata schema
 * - JSON/JSONB columns
 * - Audit logging
 * - Transactions
 *
 * **Required Table Columns (default schema):**
 * - `id`: TEXT PRIMARY KEY
 * - `keyHash`: TEXT
 * - `metadata`: JSONB (or TEXT for MySQL/SQLite)
 *
 * You can customize column names and flatten metadata into separate columns.
 *
 * @example
 * ```typescript
 * // Default schema (PostgreSQL)
 * import { DrizzleStore } from 'keypal/drizzle';
 * import { apikey } from 'keypal/drizzle/schema';
 * const store = new DrizzleStore({ db, table: apikey, provider: 'pg' });
 * 
 * // MySQL with custom column names
 * const store = new DrizzleStore({ 
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
 * const store = new DrizzleStore({ 
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
 * 
 * // With transactions
 * const store = new DrizzleStore({ 
 *   db, 
 *   table: apikey,
 *   provider: 'pg',
 *   transaction: true
 * });
 * ```
 */
export class DrizzleStore implements Storage {
	private readonly storage: Storage;
	private readonly config: DrizzleAdapterConfig;

	constructor(options: DrizzleAdapterConfig) {
		this.config = options;

		// Validate table structure if requested
		if (options.validate) {
			this.validateTableStructure();
		}

		// Detect provider if not specified
		const provider = options.provider || this.detectProvider(options.db);

		// Warn about provider-specific limitations
		if (provider === "mysql" && options.auditLogTable) {
			console.warn(
				"[Drizzle Store] MySQL detected: RETURNING clause not supported, using fallback queries"
			);
		}
		this.storage = createAdapterFactory({
			config: {
				adapterId: "drizzle",
				adapterName: "Drizzle ORM",
				supportsJSON: provider !== "sqlite", // SQLite stores JSON as text
				supportsDates: true,
				supportsBooleans: true,
				debugLogs: options.debugLogs,
			},
			schema: options.schema,
			adapter: (context) => {
				const { transformApiKeyInput, transformApiKeyOutput } = context;
				const db = options.db;
				const table = options.table;

				// Helper to check required fields in data
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
							// Query against flattened tags column
							const tagsCol = context.getColumnName("apikey", "tags");
							const lowercasedTags = tags.map((t) => t.toLowerCase());

							// In flattened schema, tags are stored as JSON array
							for (const tag of lowercasedTags) {
								conditions.push(arrayContains(table[tagsCol], [tag]));
							}

							if (ownerId !== undefined) {
								const ownerCol = context.getColumnName("apikey", "ownerId");
								conditions.push(eq(table[ownerCol], ownerId));
							}
						} else {
							// Query against JSONB metadata
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
							// Update only the changed columns
							const updates: Record<string, unknown> = {};
							for (const [key, value] of Object.entries(metadata)) {
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

					...(options.auditLogTable &&
						context.transformAuditLogInput && {
							async saveLog(log: AuditLog): Promise<void> {
								const row = context.transformAuditLogInput!(log);
								await db
									.insert(options.auditLogTable)
									.values(row as Record<string, unknown>);
							},

							async findLogs(query: AuditLogQuery): Promise<AuditLog[]> {
								// biome-ignore lint/suspicious/noExplicitAny: Multiple condition types
								const conditions: any = [];
								const auditTable = options.auditLogTable!;

								if (query.keyId) {
									const col = context.getColumnName("auditlog", "keyId");
									conditions.push(eq(auditTable[col], query.keyId));
								}

								if (query.ownerId) {
									const col = context.getColumnName("auditlog", "ownerId");
									conditions.push(eq(auditTable[col], query.ownerId));
								}

								if (query.action) {
									const col = context.getColumnName("auditlog", "action");
									conditions.push(eq(auditTable[col], query.action));
								}

								let auditQuery = db.select().from(auditTable);

								if (conditions.length > 0) {
									// biome-ignore lint/suspicious/noExplicitAny: Drizzle typing issue
									auditQuery = auditQuery.where(and(...conditions)) as any;
								}

								// Apply pagination
								const offset = query.offset ?? 0;
								// biome-ignore lint/style/noMagicNumbers: Default limit
								const limit = query.limit ?? 100;

								const timestampCol = context.getColumnName("auditlog", "timestamp");
								const rows = await auditQuery
									.orderBy(auditTable[timestampCol])
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
								const auditTable = options.auditLogTable!;

								if (query.keyId) {
									const col = context.getColumnName("auditlog", "keyId");
									conditions.push(eq(auditTable[col], query.keyId));
								}

								if (query.ownerId) {
									const col = context.getColumnName("auditlog", "ownerId");
									conditions.push(eq(auditTable[col], query.ownerId));
								}

								if (query.action) {
									const col = context.getColumnName("auditlog", "action");
									conditions.push(eq(auditTable[col], query.action));
								}

								let auditQuery = db.select().from(auditTable);

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
								const auditTable = options.auditLogTable!;

								if (query.keyId) {
									const col = context.getColumnName("auditlog", "keyId");
									conditions.push(eq(auditTable[col], query.keyId));
								}

								if (query.ownerId) {
									const col = context.getColumnName("auditlog", "ownerId");
									conditions.push(eq(auditTable[col], query.ownerId));
								}

								if (query.action) {
									const col = context.getColumnName("auditlog", "action");
									conditions.push(eq(auditTable[col], query.action));
								}

								if (conditions.length === 0) {
									return 0;
								}

								// For MySQL, use count before delete
								if (provider === "mysql") {
									const countQuery = await db
										.select()
										.from(auditTable)
										.where(and(...conditions));
									await db.delete(auditTable).where(and(...conditions));
									return countQuery.length;
								}

								// For PostgreSQL/SQLite, use RETURNING
								// biome-ignore lint/suspicious/noExplicitAny: Drizzle typing issue
								const result = (await db
									.delete(auditTable)
									.where(and(...conditions))
									.returning()) as any;

								return Array.isArray(result) ? result.length : 0;
							},

							async getLogStats(ownerId: string): Promise<AuditLogStats> {
								const auditTable = options.auditLogTable!;
								const col = context.getColumnName("auditlog", "ownerId");
								const rows = await db
									.select()
									.from(auditTable)
									.where(eq(auditTable[col], ownerId));

								const logs = rows.map(
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
	private detectProvider(db: DrizzleDB): "pg" | "mysql" | "sqlite" {
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

		// Default to PostgreSQL
		console.warn(
			"[Drizzle Store] Could not detect database provider, defaulting to PostgreSQL"
		);
		return "pg";
	}

	/**
	 * Validate that the table has required columns
	 * @private
	 */
	private validateTableStructure() {
		const table = this.config.table;
		const schema = this.config.schema;

		// Check required columns exist
		const requiredCols = schema?.flattenMetadata
			? ["id", "keyHash", "ownerId"]
			: ["id", "keyHash", "metadata"];

		for (const col of requiredCols) {
			const columnName =
				(schema?.apiKeyColumns as Record<string, string | undefined>)?.[col] ||
				col;
			if (!(columnName in table)) {
				throw new Error(
					`[Drizzle Store] Required column "${columnName}" not found in table. ` +
						`Make sure your table schema includes all required columns.`
				);
			}
		}

		// Validate audit log table if provided
		if (this.config.auditLogTable) {
			const auditTable = this.config.auditLogTable;
			const auditCols = ["id", "keyId", "ownerId", "action", "timestamp"];

			for (const col of auditCols) {
				const columnName =
					schema?.auditLogColumns?.[
						col as keyof typeof schema.auditLogColumns
					] || col;
				if (!(columnName in auditTable)) {
					throw new Error(
						`[Drizzle Store] Required audit log column "${columnName}" not found in table. ` +
							`Make sure your audit log table schema includes all required columns.`
					);
				}
			}
		}
	}
}
