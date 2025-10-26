import type { ApiKeyMetadata, ApiKeyRecord } from "../types/api-key-types";
import type {
	AuditLog,
	AuditLogQuery,
	AuditLogStats,
} from "../types/audit-log-types";
import type { Storage } from "../types/storage-types";

// WIP: This is a placeholder for the Convex storage adapter.

// Convex types - these would be imported from convex/server in a real implementation
type ConvexCtx = any;
type ConvexApi = any;

/**
 * Convex storage adapter for API keys
 *          
 * **Setup Instructions:**
 *
 * 1. Create your Convex schema:
 * ```ts
 * // convex/schema.ts
 * import { defineSchema, defineTable } from "convex/server";
 * import { v } from "convex/values";
 *
 * export default defineSchema({
 *   apiKeys: defineTable({
 *     keyHash: v.string(),
 *     metadata: v.any(),
 *   })
 *     .index("by_keyHash", ["keyHash"])
 *     .index("by_owner", ["metadata.ownerId"]),
 *
 *   auditLogs: defineTable({
 *     keyId: v.string(),
 *     ownerId: v.string(),
 *     action: v.string(),
 *     timestamp: v.string(),
 *     data: v.optional(v.any()),
 *   })
 *     .index("by_keyId", ["keyId"])
 *     .index("by_owner", ["ownerId"])
 *     .index("by_timestamp", ["timestamp"]),
 * });
 * ```
 *
 * 2. Create Convex functions for your tables
 * (You'll need to implement mutations/queries for CRUD operations)
 *
 * 3. Use the adapter:
 * ```typescript
 * import { ConvexStore } from 'keypal/convex';
 * import { api } from './_generated/api';
 *
 * const store = new ConvexStore({
 *   ctx, // Your Convex ctx (query or action)
 *   api, // Your Convex api object
 *   tableName: 'apiKeys',
 *   logTableName: 'auditLogs',
 * });
 * ```
 */
export class ConvexStore implements Storage {
	private readonly ctx: ConvexCtx;
	private readonly api: ConvexApi;
	private readonly tableName: string;
	private readonly logTableName: string;

	constructor(options: {
		ctx: ConvexCtx;
		api: ConvexApi;
		tableName?: string;
		logTableName?: string;
	}) {
		this.ctx = options.ctx;
		this.api = options.api;
		this.tableName = options.tableName ?? "apiKeys";
		this.logTableName = options.logTableName ?? "auditLogs";
	}

	private toRecord(doc: any): ApiKeyRecord {
		return {
			id: doc._id,
			keyHash: doc.keyHash,
			metadata: doc.metadata as ApiKeyMetadata,
		};
	}

	async save(record: ApiKeyRecord): Promise<void> {
		if (!("runMutation" in this.ctx)) {
			throw new Error("save requires an ActionCtx (runMutation)");
		}

		const existing = await this.findById(record.id);
		if (existing) {
			throw new Error(`API key with id ${record.id} already exists`);
		}

		await this.ctx.runMutation(this.api.storage.create, {
			table: this.tableName,
			data: {
				_id: record.id,
				keyHash: record.keyHash,
				metadata: record.metadata,
			},
		});
	}

	async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
		const result = await this.ctx.runQuery(this.api.storage.findByHash, {
			table: this.tableName,
			keyHash,
		});

		return result ? this.toRecord(result) : null;
	}

	async findById(id: string): Promise<ApiKeyRecord | null> {
		const result = await this.ctx.runQuery(this.api.storage.findById, {
			table: this.tableName,
			id,
		});

		return result ? this.toRecord(result) : null;
	}

	async findByOwner(ownerId: string): Promise<ApiKeyRecord[]> {
		const results = await this.ctx.runQuery(this.api.storage.findByOwner, {
			table: this.tableName,
			ownerId,
		});

		return results.map((doc: any) => this.toRecord(doc));
	}

	async findByTags(tags: string[], ownerId?: string): Promise<ApiKeyRecord[]> {
		const results = await this.ctx.runQuery(this.api.storage.findByTags, {
			table: this.tableName,
			tags,
			ownerId,
		});

		return results.map((doc: any) => this.toRecord(doc));
	}

	async findByTag(tag: string, ownerId?: string): Promise<ApiKeyRecord[]> {
		return this.findByTags([tag], ownerId);
	}

	async updateMetadata(
		id: string,
		metadata: Partial<ApiKeyMetadata>
	): Promise<void> {
		if (!("runMutation" in this.ctx)) {
			throw new Error("updateMetadata requires an ActionCtx (runMutation)");
		}

		await this.ctx.runMutation(this.api.storage.updateMetadata, {
			table: this.tableName,
			id,
			metadata,
		});
	}

	async delete(id: string): Promise<void> {
		if (!("runMutation" in this.ctx)) {
			throw new Error("delete requires an ActionCtx (runMutation)");
		}

		await this.ctx.runMutation(this.api.storage.delete, {
			table: this.tableName,
			id,
		});
	}

	async deleteByOwner(ownerId: string): Promise<void> {
		if (!("runMutation" in this.ctx)) {
			throw new Error("deleteByOwner requires an ActionCtx (runMutation)");
		}

		await this.ctx.runMutation(this.api.storage.deleteByOwner, {
			table: this.tableName,
			ownerId,
		});
	}

	async saveLog(log: AuditLog): Promise<void> {
		if (!("runMutation" in this.ctx)) {
			throw new Error("saveLog requires an ActionCtx (runMutation)");
		}

		await this.ctx.runMutation(this.api.storage.createLog, {
			table: this.logTableName,
			data: {
				_id: log.id,
				keyId: log.keyId,
				ownerId: log.ownerId,
				action: log.action,
				timestamp: log.timestamp,
				data: log.data,
			},
		});
	}

	async findLogs(query: AuditLogQuery): Promise<AuditLog[]> {
		const results = await this.ctx.runQuery(this.api.storage.findLogs, {
			table: this.logTableName,
			query,
		});

		return results.map((doc: any) => ({
			id: doc._id,
			keyId: doc.keyId,
			ownerId: doc.ownerId,
			action: doc.action,
			timestamp: doc.timestamp,
		}));
	}

	async countLogs(query: AuditLogQuery): Promise<number> {
		return await this.ctx.runQuery(this.api.storage.countLogs, {
			table: this.logTableName,
			query,
		});
	}

	async deleteLogs(query: AuditLogQuery): Promise<number> {
		if (!("runMutation" in this.ctx)) {
			throw new Error("deleteLogs requires an ActionCtx (runMutation)");
		}

		return await this.ctx.runMutation(this.api.storage.deleteLogs, {
			table: this.logTableName,
			query,
		});
	}

	async getLogStats(ownerId: string): Promise<AuditLogStats> {
		return await this.ctx.runQuery(this.api.storage.getLogStats, {
			table: this.logTableName,
			ownerId,
		});
	}
}

