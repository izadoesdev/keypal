import type { ApiKeyMetadata, ApiKeyRecord } from "../types/api-key-types";
import type {
	AuditLog,
	AuditLogQuery,
	AuditLogStats,
} from "../types/audit-log-types";
import type { Storage } from "../types/storage-types";

export class MemoryStore implements Storage {
	private readonly keys: Map<string, ApiKeyRecord> = new Map();
	private readonly logs: Map<string, AuditLog> = new Map();

	async save(record: ApiKeyRecord): Promise<void> {
		const existing = await this.findById(record.id);
		if (existing) {
			throw new Error(`API key with id ${record.id} already exists`);
		}
		await this.keys.set(record.id, record);
	}

	async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
		for (const record of await this.keys.values()) {
			if (record.keyHash === keyHash) {
				return record;
			}
		}
		return null;
	}

	async findById(id: string): Promise<ApiKeyRecord | null> {
		return (await this.keys.get(id)) ?? null;
	}

	async findByOwner(ownerId: string): Promise<ApiKeyRecord[]> {
		return Array.from(await this.keys.values()).filter(
			(record) => record.metadata.ownerId === ownerId
		);
	}

	async findByTags(tags: string[], ownerId?: string): Promise<ApiKeyRecord[]> {
		return Array.from(await this.keys.values()).filter((record) => {
			if (ownerId !== undefined && record.metadata.ownerId !== ownerId) {
				return false;
			}
			return tags.some((t) => record.metadata.tags?.includes(t.toLowerCase()));
		});
	}

	async findByTag(tag: string, ownerId?: string): Promise<ApiKeyRecord[]> {
		return await this.findByTags([tag], ownerId);
	}

	async updateMetadata(
		id: string,
		metadata: Partial<ApiKeyMetadata>
	): Promise<void> {
		const record = await this.keys.get(id);
		if (!record) {
			throw new Error(`API key with id ${id} not found`);
		}
		record.metadata = { ...record.metadata, ...metadata };
	}

	async delete(id: string): Promise<void> {
		await this.keys.delete(id);
	}

	async deleteByOwner(ownerId: string): Promise<void> {
		for (const [id, record] of await this.keys.entries()) {
			if (record.metadata.ownerId === ownerId) {
				this.keys.delete(id);
			}
		}
	}

	saveLog(log: AuditLog): Promise<void> {
		this.logs.set(log.id, log);
		return Promise.resolve();
	}

	findLogs(query: AuditLogQuery): Promise<AuditLog[]> {
		let logs = Array.from(this.logs.values());

		// Filter by keyId
		if (query.keyId) {
			logs = logs.filter((log) => log.keyId === query.keyId);
		}

		// Filter by ownerId
		if (query.ownerId) {
			logs = logs.filter((log) => log.ownerId === query.ownerId);
		}

		// Filter by action
		if (query.action) {
			logs = logs.filter((log) => log.action === query.action);
		}

		// Filter by date range
		if (query.startDate) {
			const startDate = query.startDate;
			logs = logs.filter((log) => log.timestamp >= startDate);
		}

		if (query.endDate) {
			const endDate = query.endDate;
			logs = logs.filter((log) => log.timestamp <= endDate);
		}

		// Sort by timestamp descending (most recent first)
		logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

		// Apply pagination
		const offset = query.offset ?? 0;
		// biome-ignore lint/style/noMagicNumbers: Default limit of 100
		const limit = query.limit ?? 100;

		return Promise.resolve(logs.slice(offset, offset + limit));
	}

	countLogs(query: AuditLogQuery): Promise<number> {
		let logs = Array.from(this.logs.values());

		// Apply same filters as findLogs
		if (query.keyId) {
			logs = logs.filter((log) => log.keyId === query.keyId);
		}

		if (query.ownerId) {
			logs = logs.filter((log) => log.ownerId === query.ownerId);
		}

		if (query.action) {
			logs = logs.filter((log) => log.action === query.action);
		}

		if (query.startDate) {
			const startDate = query.startDate;
			logs = logs.filter((log) => log.timestamp >= startDate);
		}

		if (query.endDate) {
			const endDate = query.endDate;
			logs = logs.filter((log) => log.timestamp <= endDate);
		}

		return Promise.resolve(logs.length);
	}

	deleteLogs(query: AuditLogQuery): Promise<number> {
		let logsToDelete = Array.from(this.logs.values());

		// Apply same filters as findLogs
		if (query.keyId) {
			logsToDelete = logsToDelete.filter((log) => log.keyId === query.keyId);
		}

		if (query.ownerId) {
			logsToDelete = logsToDelete.filter(
				(log) => log.ownerId === query.ownerId
			);
		}

		if (query.action) {
			logsToDelete = logsToDelete.filter((log) => log.action === query.action);
		}

		if (query.startDate) {
			const startDate = query.startDate;
			logsToDelete = logsToDelete.filter((log) => log.timestamp >= startDate);
		}

		if (query.endDate) {
			const endDate = query.endDate;
			logsToDelete = logsToDelete.filter((log) => log.timestamp <= endDate);
		}

		// Delete the logs
		for (const log of logsToDelete) {
			this.logs.delete(log.id);
		}

		return Promise.resolve(logsToDelete.length);
	}

	getLogStats(ownerId: string): Promise<AuditLogStats> {
		const logs = Array.from(this.logs.values()).filter(
			(log) => log.ownerId === ownerId
		);

		const byAction: Partial<Record<string, number>> = {};
		let lastActivity: string | null = null;

		for (const log of logs) {
			// Count by action
			byAction[log.action] = (byAction[log.action] || 0) + 1;

			// Track last activity
			if (!lastActivity || log.timestamp > lastActivity) {
				lastActivity = log.timestamp;
			}
		}

		return Promise.resolve({
			total: logs.length,
			byAction,
			lastActivity,
		});
	}
}
