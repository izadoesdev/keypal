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
import { DEFAULT_QUERY_LIMIT, calculateLogStats } from "./utils";

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
}

/**
 * Create a Prisma storage adapter for API keys
 *
 * **Supports:**
 * - PostgreSQL, MySQL, SQLite, MongoDB, SQL Server
 * - Custom column names
 * - Custom model names
 * - Flattened metadata schema
 * - JSON columns
 * - Audit logging
 *
 * **Required Model Fields (default schema):**
 * - `id`: String @id
 * - `keyHash`: String @unique
 * - `metadata`: Json
 *
 * @example
 * ```typescript
 * // Default schema
 * import { PrismaClient } from '@prisma/client';
 * import { createPrismaStore } from 'keypal/prisma';
 *
 * const prisma = new PrismaClient();
 * const store = createPrismaStore({ prisma, model: 'apiKey' });
 * 
 * // With custom field names
 * const store = createPrismaStore({ 
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
 * const store = createPrismaStore({ 
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
export function createPrismaStore(options: PrismaAdapterConfig): Storage {
	const { prisma, auditLogModel } = options;
	const model = prisma[options.model];

	if (!model) {
		throw new Error(
			`[Prisma Store] Model "${options.model}" not found in Prisma client. ` +
				`Make sure the model name matches your schema (camelCase).`
		);
	}

	return createAdapterFactory({
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

			return {
				async save(record: ApiKeyRecord): Promise<void> {
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
								[tagsCol]: { has: tag },
							})),
						};

						if (ownerId !== undefined) {
							const ownerCol = context.getColumnName("apikey", "ownerId");
							where.AND = { [ownerCol]: ownerId };
						}

						const rows = await model.findMany({ where });
						return rows.map(transformApiKeyOutput);
					}

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

				...(auditLogModel &&
					context.transformAuditLogInput && {
						async saveLog(log: AuditLog): Promise<void> {
							const auditModel = prisma[auditLogModel];
							if (!auditModel) {
								throw new Error(
									`[Prisma Store] Audit model "${auditLogModel}" not found`
								);
							}
							const row = context.transformAuditLogInput!(log);
							await auditModel.create({ data: row });
						},

						async findLogs(query: AuditLogQuery): Promise<AuditLog[]> {
							const auditModel = prisma[auditLogModel];
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
								take: query.limit ?? DEFAULT_QUERY_LIMIT,
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
							const auditModel = prisma[auditLogModel];
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
							const auditModel = prisma[auditLogModel];
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
							const auditModel = prisma[auditLogModel];
							const col = context.getColumnName("auditlog", "ownerId");
							const rows = await auditModel.findMany({
								where: { [col]: ownerId },
							});

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
 * Storage adapter class for Prisma ORM
 * 
 * @example
 * ```typescript
 * const store = new PrismaStore({ prisma, model: 'apiKey' });
 * ```
 */
export class PrismaStore implements Storage {
	private readonly storage: Storage;

	constructor(options: PrismaAdapterConfig) {
		this.storage = createPrismaStore(options);
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
