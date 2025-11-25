import type { ApiKeyMetadata, ApiKeyRecord } from "../types/api-key-types";
import type {
	AuditLog,
	AuditLogQuery,
	AuditLogStats,
} from "../types/audit-log-types";
import type { Storage } from "../types/storage-types";

export class MemoryStore implements Storage {
	private readonly keys = new Map<string, ApiKeyRecord>();
	private readonly hashIndex = new Map<string, string>();
	private readonly ownerIndex = new Map<string, Set<string>>();
	private readonly logs = new Map<string, AuditLog>();

	async save(record: ApiKeyRecord): Promise<void> {
		if (this.keys.has(record.id)) {
			throw new Error(`API key with id ${record.id} already exists`);
		}
		if (this.hashIndex.has(record.keyHash)) {
			throw new Error("API key hash collision detected");
		}

		this.keys.set(record.id, record);
		this.hashIndex.set(record.keyHash, record.id);

		const { ownerId } = record.metadata;
		if (ownerId) {
			const ownerKeys = this.ownerIndex.get(ownerId) ?? new Set();
			ownerKeys.add(record.id);
			this.ownerIndex.set(ownerId, ownerKeys);
		}
	}

	async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
		const id = this.hashIndex.get(keyHash);
		return id ? this.keys.get(id) ?? null : null;
	}

	async findById(id: string): Promise<ApiKeyRecord | null> {
		return this.keys.get(id) ?? null;
	}

	async findByOwner(ownerId: string): Promise<ApiKeyRecord[]> {
		const ids = this.ownerIndex.get(ownerId);
		if (!ids?.size) return [];

		const records: ApiKeyRecord[] = [];
		for (const id of ids) {
			const record = this.keys.get(id);
			if (record) records.push(record);
		}
		return records;
	}

	async findByTags(tags: string[], ownerId?: string): Promise<ApiKeyRecord[]> {
		const lowercaseTags = tags.map((t) => t.toLowerCase());
		const records =
			ownerId !== undefined
				? await this.findByOwner(ownerId)
				: Array.from(this.keys.values());

		return records.filter((record) =>
			lowercaseTags.some((t) => record.metadata.tags?.includes(t))
		);
	}

	async findByTag(tag: string, ownerId?: string): Promise<ApiKeyRecord[]> {
		return this.findByTags([tag], ownerId);
	}

	async updateMetadata(
		id: string,
		metadata: Partial<ApiKeyMetadata>
	): Promise<void> {
		const record = this.keys.get(id);
		if (!record) {
			throw new Error(`API key with id ${id} not found`);
		}

		const oldOwnerId = record.metadata.ownerId;
		record.metadata = { ...record.metadata, ...metadata };
		const newOwnerId = record.metadata.ownerId;

		if (oldOwnerId !== newOwnerId) {
			if (oldOwnerId) {
				const oldOwnerKeys = this.ownerIndex.get(oldOwnerId);
				oldOwnerKeys?.delete(id);
				if (oldOwnerKeys?.size === 0) this.ownerIndex.delete(oldOwnerId);
			}
			if (newOwnerId) {
				const newOwnerKeys = this.ownerIndex.get(newOwnerId) ?? new Set();
				newOwnerKeys.add(id);
				this.ownerIndex.set(newOwnerId, newOwnerKeys);
			}
		}
	}

	async delete(id: string): Promise<void> {
		const record = this.keys.get(id);
		if (record) {
			this.hashIndex.delete(record.keyHash);
			const { ownerId } = record.metadata;
			if (ownerId) {
				const ownerKeys = this.ownerIndex.get(ownerId);
				ownerKeys?.delete(id);
				if (ownerKeys?.size === 0) this.ownerIndex.delete(ownerId);
			}
		}
		this.keys.delete(id);
	}

	async deleteByOwner(ownerId: string): Promise<void> {
		const ids = this.ownerIndex.get(ownerId);
		if (!ids) return;

		for (const id of ids) {
			const record = this.keys.get(id);
			if (record) {
				this.hashIndex.delete(record.keyHash);
				this.keys.delete(id);
			}
		}
		this.ownerIndex.delete(ownerId);
	}

	saveLog(log: AuditLog): Promise<void> {
		this.logs.set(log.id, log);
		return Promise.resolve();
	}

	findLogs(query: AuditLogQuery): Promise<AuditLog[]> {
		let logs = Array.from(this.logs.values());

		if (query.keyId) logs = logs.filter((log) => log.keyId === query.keyId);
		if (query.ownerId)
			logs = logs.filter((log) => log.ownerId === query.ownerId);
		if (query.action) logs = logs.filter((log) => log.action === query.action);
		if (query.startDate)
			logs = logs.filter((log) => log.timestamp >= query.startDate!);
		if (query.endDate)
			logs = logs.filter((log) => log.timestamp <= query.endDate!);

		logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

		const offset = query.offset ?? 0;
		// biome-ignore lint/style/noMagicNumbers: Default limit
		const limit = query.limit ?? 100;
		return Promise.resolve(logs.slice(offset, offset + limit));
	}

	countLogs(query: AuditLogQuery): Promise<number> {
		let logs = Array.from(this.logs.values());

		if (query.keyId) logs = logs.filter((log) => log.keyId === query.keyId);
		if (query.ownerId)
			logs = logs.filter((log) => log.ownerId === query.ownerId);
		if (query.action) logs = logs.filter((log) => log.action === query.action);
		if (query.startDate)
			logs = logs.filter((log) => log.timestamp >= query.startDate!);
		if (query.endDate)
			logs = logs.filter((log) => log.timestamp <= query.endDate!);

		return Promise.resolve(logs.length);
	}

	deleteLogs(query: AuditLogQuery): Promise<number> {
		let logsToDelete = Array.from(this.logs.values());

		if (query.keyId)
			logsToDelete = logsToDelete.filter((log) => log.keyId === query.keyId);
		if (query.ownerId)
			logsToDelete = logsToDelete.filter(
				(log) => log.ownerId === query.ownerId
			);
		if (query.action)
			logsToDelete = logsToDelete.filter((log) => log.action === query.action);
		if (query.startDate)
			logsToDelete = logsToDelete.filter(
				(log) => log.timestamp >= query.startDate!
			);
		if (query.endDate)
			logsToDelete = logsToDelete.filter(
				(log) => log.timestamp <= query.endDate!
			);

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
			byAction[log.action] = (byAction[log.action] || 0) + 1;
			if (!lastActivity || log.timestamp > lastActivity) {
				lastActivity = log.timestamp;
			}
		}

		return Promise.resolve({ total: logs.length, byAction, lastActivity });
	}
}
