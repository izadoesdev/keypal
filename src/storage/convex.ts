import type { ApiKeyMutableFields, ApiKeyRecord } from "../types/api-key-types";
import type {
	AuditLog,
	AuditLogQuery,
	AuditLogStats,
} from "../types/audit-log-types";
import type { Storage } from "../types/storage-types";

// biome-ignore lint/suspicious/noExplicitAny: Convex types
type ConvexCtx = any;
// biome-ignore lint/suspicious/noExplicitAny: Convex types
type ConvexApi = any;

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

	private toRecord(doc: Record<string, unknown>): ApiKeyRecord {
		return {
			id: doc._id as string,
			keyHash: doc.keyHash as string,
			ownerId: doc.ownerId as string,
			name: doc.name as string | undefined,
			description: doc.description as string | undefined,
			scopes: doc.scopes as string[] | undefined,
			resources: doc.resources as Record<string, string[]> | undefined,
			expiresAt: doc.expiresAt as string | null | undefined,
			createdAt: doc.createdAt as string | undefined,
			lastUsedAt: doc.lastUsedAt as string | undefined,
			enabled: doc.enabled as boolean | undefined,
			revokedAt: doc.revokedAt as string | null | undefined,
			rotatedTo: doc.rotatedTo as string | null | undefined,
			tags: doc.tags as string[] | undefined,
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

		const { id: _id, ...rest } = record;
		await this.ctx.runMutation(this.api.storage.create, {
			table: this.tableName,
			data: { _id: record.id, ...rest },
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
		return results.map((doc: Record<string, unknown>) => this.toRecord(doc));
	}

	async findByTags(tags: string[], ownerId?: string): Promise<ApiKeyRecord[]> {
		const results = await this.ctx.runQuery(this.api.storage.findByTags, {
			table: this.tableName,
			tags,
			ownerId,
		});
		return results.map((doc: Record<string, unknown>) => this.toRecord(doc));
	}

	async findByTag(tag: string, ownerId?: string): Promise<ApiKeyRecord[]> {
		return this.findByTags([tag], ownerId);
	}

	async update(
		id: string,
		fields: Partial<ApiKeyMutableFields>
	): Promise<void> {
		if (!("runMutation" in this.ctx)) {
			throw new Error("update requires an ActionCtx (runMutation)");
		}

		await this.ctx.runMutation(this.api.storage.update, {
			table: this.tableName,
			id,
			fields,
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

		return results.map((doc: Record<string, unknown>) => ({
			id: doc._id as string,
			keyId: doc.keyId as string,
			ownerId: doc.ownerId as string,
			action: doc.action as string,
			timestamp: doc.timestamp as string,
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
