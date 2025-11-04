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
 * Generic Prisma Client interface
 * Supports any Prisma Client instance
 */
export interface PrismaClientLike {
	// biome-ignore lint/suspicious/noExplicitAny: Support any Prisma model
	[key: string]: any;
	$transaction?: <R>(fn: (tx: PrismaClientLike) => Promise<R>) => Promise<R>;
}

/**
 * Configuration for Prisma adapter
 */
export interface PrismaAdapterConfig {
	/**
	 * The Prisma Client instance
	 */
	prisma: PrismaClientLike;

	/**
	 * Name of the Prisma model for API keys
	 * (e.g., 'apiKey' for model ApiKey)
	 */
	model: string;

	/**
	 * Schema configuration for custom column names and flattened metadata
	 */
	schema?: SchemaConfig;

	/**
	 * Optional model name for audit logs
	 */
	auditLogModel?: string;

	/**
	 * Enable debug logging
	 * @default false
	 */
	debugLogs?: boolean;

	/**
	 * Validate model structure on initialization
	 * @default false
	 */
	validate?: boolean;

	/**
	 * Enable transaction support
	 * Prisma automatically supports transactions via $transaction
	 * @default false
	 */
	transaction?: boolean;
}

/**
 * Storage adapter for API keys using Prisma ORM
 *
 * **Supports:**
 * - PostgreSQL, MySQL, SQLite, MongoDB, SQL Server
 * - Custom column names
 * - Custom model names
 * - Flattened metadata schema
 * - JSON columns
 * - Audit logging
 * - Transactions
 *
 * **Required Model Fields (default schema):**
 * - `id`: String @id
 * - `keyHash`: String @unique
 * - `metadata`: Json
 *
 * You can customize field names and flatten metadata into separate columns.
 *
 * @example
 * ```typescript
 * // Default schema
 * import { PrismaClient } from '@prisma/client';
 * import { PrismaStore } from 'keypal/prisma';
 *
 * const prisma = new PrismaClient();
 * const store = new PrismaStore({ prisma, model: 'apiKey' });
 * 
 * // With custom field names
 * const store = new PrismaStore({ 
 *   prisma, 
 *   model: 'apiKey',
 *   schema: {
 *     apiKeyColumns: {
 *       id: 'keyId',
 *       keyHash: 'hash',
 *       metadata: 'data'
 *     }
 *   }
 * });
 * 
 * // With flattened metadata
 * const store = new PrismaStore({ 
 *   prisma, 
 *   model: 'apiKey',
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
 * const store = new PrismaStore({ 
 *   prisma, 
 *   model: 'apiKey',
 *   transaction: true
 * });
 * ```
 *
 * **Example Prisma Schema:**
 * ```prisma
 * model ApiKey {
 *   id       String @id @default(cuid())
 *   keyHash  String @unique
 *   metadata Json
 *
 *   @@index([keyHash])
 *   @@map("api_keys")
 * }
 * ```
 */
export class PrismaStore implements Storage {
	private readonly storage: Storage;
	private readonly config: PrismaAdapterConfig;

	constructor(options: PrismaAdapterConfig) {
		this.config = options;

		// Validate model structure if requested
		if (options.validate) {
			this.validateModelStructure();
		}

		this.storage = createAdapterFactory({
			config: {
				adapterId: "prisma",
				adapterName: "Prisma ORM",
				supportsJSON: true,
				supportsDates: true,
				supportsBooleans: true,
				debugLogs: options.debugLogs,
			},
			schema: options.schema,
			adapter: (context) => {
				const { transformApiKeyInput, transformApiKeyOutput } = context;
				const prisma = options.prisma;
				const model = prisma[options.model];

				if (!model) {
					throw new Error(
						`[Prisma Store] Model "${options.model}" not found in Prisma client. ` +
							`Make sure the model name matches your schema (camelCase).`
					);
				}

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
						await model.create({ data: row });
					},

					async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
						const keyHashCol = context.getColumnName("apikey", "keyHash");
						const row = await model.findUnique({
							where: { [keyHashCol]: keyHash },
						});

						return row ? transformApiKeyOutput(row) : null;
					},

					async findById(id: string): Promise<ApiKeyRecord | null> {
						const idCol = context.getColumnName("apikey", "id");
						const row = await model.findUnique({
							where: { [idCol]: id },
						});

						return row ? transformApiKeyOutput(row) : null;
					},

					async findByOwner(ownerId: string): Promise<ApiKeyRecord[]> {
						if (context.schema.flattenMetadata) {
							const ownerCol = context.getColumnName("apikey", "ownerId");
							const rows = await model.findMany({
								where: { [ownerCol]: ownerId },
							});
							return rows.map(transformApiKeyOutput);
						}

						// For JSON metadata, we need to fetch all and filter
						// Prisma's JSON filtering is limited
						const metadataCol = context.getColumnName("apikey", "metadata");
						const rows = await model.findMany({
							where: {
								[metadataCol]: {
									path: ["ownerId"],
									equals: ownerId,
								},
							},
						});

						return rows.map(transformApiKeyOutput);
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
							const where: Record<string, unknown> = {
								OR: lowercasedTags.map((tag) => ({
									[tagsCol]: {
										has: tag,
									},
								})),
							};

							if (ownerId !== undefined) {
								const ownerCol = context.getColumnName("apikey", "ownerId");
								where.AND = { [ownerCol]: ownerId };
							}

							const rows = await model.findMany({ where });
							return rows.map(transformApiKeyOutput);
						}

						// For JSON metadata
						const metadataCol = context.getColumnName("apikey", "metadata");
						const where: Record<string, unknown> = {
							OR: lowercasedTags.map((tag) => ({
								[metadataCol]: {
									path: ["tags"],
									array_contains: tag,
								},
							})),
						};

						if (ownerId !== undefined) {
							where.AND = {
								[metadataCol]: {
									path: ["ownerId"],
									equals: ownerId,
								},
							};
						}

						const rows = await model.findMany({ where });
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
							// Update only changed columns
							const updates: Record<string, unknown> = {};
							for (const [key] of Object.entries(metadata)) {
								const colName = context.getColumnName("apikey", key);
								updates[colName] = (row as Record<string, unknown>)[colName];
							}
							await model.update({
								where: { [idCol]: id },
								data: updates,
							});
						} else {
							const metadataCol = context.getColumnName("apikey", "metadata");
							await model.update({
								where: { [idCol]: id },
								data: { [metadataCol]: updated },
							});
						}
					},

					async delete(id: string): Promise<void> {
						try {
							const idCol = context.getColumnName("apikey", "id");
							await model.delete({
								where: { [idCol]: id },
							});
						} catch (error) {
							// Prisma throws P2025 when record doesn't exist, make delete idempotent
							// biome-ignore lint/suspicious/noExplicitAny: Prisma error has code property
							if ((error as any)?.code !== "P2025") {
								throw error;
							}
						}
					},

					async deleteByOwner(ownerId: string): Promise<void> {
						if (context.schema.flattenMetadata) {
							const ownerCol = context.getColumnName("apikey", "ownerId");
							await model.deleteMany({
								where: { [ownerCol]: ownerId },
							});
						} else {
							// For JSON metadata, fetch then delete
							const records = await this.findByOwner(ownerId);
							const idCol = context.getColumnName("apikey", "id");
							await model.deleteMany({
								where: {
									[idCol]: {
										in: records.map((r) => r.id),
									},
								},
							});
						}
					},

					// Audit log methods (if audit model provided)
					...(options.auditLogModel &&
						context.transformAuditLogInput && {
							async saveLog(log: AuditLog): Promise<void> {
								const auditModel = prisma[options.auditLogModel!];
								if (!auditModel) {
									throw new Error(
										`[Prisma Store] Audit model "${options.auditLogModel}" not found`
									);
								}
								const row = context.transformAuditLogInput!(log);
								await auditModel.create({ data: row });
							},

							async findLogs(query: AuditLogQuery): Promise<AuditLog[]> {
								const auditModel = prisma[options.auditLogModel!];
								const where: Record<string, unknown> = {};

								if (query.keyId) {
									const col = context.getColumnName("auditlog", "keyId");
									where[col] = query.keyId;
								}

								if (query.ownerId) {
									const col = context.getColumnName("auditlog", "ownerId");
									where[col] = query.ownerId;
								}

								if (query.action) {
									const col = context.getColumnName("auditlog", "action");
									where[col] = query.action;
								}

								const rows = await auditModel.findMany({
									where,
									skip: query.offset ?? 0,
									// biome-ignore lint/style/noMagicNumbers: Default limit
									take: query.limit ?? 100,
									orderBy: {
										[context.getColumnName("auditlog", "timestamp")]: "desc",
									},
								});

								return rows.map(
									(row: Record<string, unknown>) =>
										context.transformAuditLogOutput?.(row)!
								);
							},

							async countLogs(query: AuditLogQuery): Promise<number> {
								const auditModel = prisma[options.auditLogModel!];
								const where: Record<string, unknown> = {};

								if (query.keyId) {
									const col = context.getColumnName("auditlog", "keyId");
									where[col] = query.keyId;
								}

								if (query.ownerId) {
									const col = context.getColumnName("auditlog", "ownerId");
									where[col] = query.ownerId;
								}

								if (query.action) {
									const col = context.getColumnName("auditlog", "action");
									where[col] = query.action;
								}

								return auditModel.count({ where });
							},

							async deleteLogs(query: AuditLogQuery): Promise<number> {
								const auditModel = prisma[options.auditLogModel!];
								const where: Record<string, unknown> = {};

								if (query.keyId) {
									const col = context.getColumnName("auditlog", "keyId");
									where[col] = query.keyId;
								}

								if (query.ownerId) {
									const col = context.getColumnName("auditlog", "ownerId");
									where[col] = query.ownerId;
								}

								if (query.action) {
									const col = context.getColumnName("auditlog", "action");
									where[col] = query.action;
								}

								if (Object.keys(where).length === 0) {
									return 0;
								}

								const result = await auditModel.deleteMany({ where });
								return result.count;
							},

							async getLogStats(ownerId: string): Promise<AuditLogStats> {
								const auditModel = prisma[options.auditLogModel!];
								const col = context.getColumnName("auditlog", "ownerId");
								const rows = await auditModel.findMany({
									where: { [col]: ownerId },
								});

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
	 * Validate that the model has required fields
	 * @private
	 */
	private validateModelStructure() {
		const model = this.config.prisma[this.config.model];
		if (!model) {
			throw new Error(
				`[Prisma Store] Model "${this.config.model}" not found in Prisma client. ` +
					`Available models: ${Object.keys(this.config.prisma).filter((k) => !k.startsWith("$") && !k.startsWith("_")).join(", ")}`
			);
		}

		// Note: Prisma doesn't expose runtime schema validation easily
		// This is a basic check - users should rely on Prisma's compile-time checks
		console.warn(
			"[Prisma Store] Validation enabled. Make sure your Prisma schema includes: id, keyHash, and metadata (or flattened columns)"
		);
	}
}
