import type { ApiKeyMetadata, ApiKeyRecord } from "../types/api-key-types";
import type {
	AuditLog,
	AuditLogQuery,
	AuditLogStats,
} from "../types/audit-log-types";
import type { Storage } from "../types/storage-types";
import { DEFAULT_QUERY_LIMIT, calculateLogStats } from "./utils";

export class MemoryStore implements Storage {
	private readonly keys = new Map<string, ApiKeyRecord>();
	private readonly hashIndex = new Map<string, string>();
	private readonly ownerIndex = new Map<string, Set<string>>();
	private readonly tagIndex = new Map<string, Set<string>>();
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

		const { ownerId, tags } = record.metadata;
		if (ownerId) {
			const ownerKeys = this.ownerIndex.get(ownerId) ?? new Set();
			ownerKeys.add(record.id);
			this.ownerIndex.set(ownerId, ownerKeys);
		}

		if (tags) {
			for (const tag of tags) {
				const tagKeys = this.tagIndex.get(tag) ?? new Set();
				tagKeys.add(record.id);
				this.tagIndex.set(tag, tagKeys);
			}
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

		// Use tag index for fast lookup
		const matchingIds = new Set<string>();
		for (const tag of lowercaseTags) {
			const ids = this.tagIndex.get(tag);
			if (ids) {
				for (const id of ids) {
					matchingIds.add(id);
				}
			}
		}

		const records: ApiKeyRecord[] = [];
		for (const id of matchingIds) {
			const record = this.keys.get(id);
			if (record && (ownerId === undefined || record.metadata.ownerId === ownerId)) {
				records.push(record);
			}
		}
		return records;
	}

	async findByTag(tag: string, ownerId?: string): Promise<ApiKeyRecord[]> {
		const lowercaseTag = tag.toLowerCase();
		const ids = this.tagIndex.get(lowercaseTag);
		if (!ids?.size) return [];

		const records: ApiKeyRecord[] = [];
		for (const id of ids) {
			const record = this.keys.get(id);
			if (record && (ownerId === undefined || record.metadata.ownerId === ownerId)) {
				records.push(record);
			}
		}
		return records;
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
		const oldTags = record.metadata.tags;
		record.metadata = { ...record.metadata, ...metadata };
		const newOwnerId = record.metadata.ownerId;
		const newTags = record.metadata.tags;

		// Update owner index if changed
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

		// Update tag index if tags changed
		if (metadata.tags !== undefined) {
			// Remove old tags from index
			if (oldTags) {
				for (const tag of oldTags) {
					const tagKeys = this.tagIndex.get(tag);
					tagKeys?.delete(id);
					if (tagKeys?.size === 0) this.tagIndex.delete(tag);
				}
			}
			// Add new tags to index
			if (newTags) {
				for (const tag of newTags) {
					const tagKeys = this.tagIndex.get(tag) ?? new Set();
					tagKeys.add(id);
					this.tagIndex.set(tag, tagKeys);
				}
			}
		}
	}

	async delete(id: string): Promise<void> {
		const record = this.keys.get(id);
		if (record) {
			this.hashIndex.delete(record.keyHash);
			const { ownerId, tags } = record.metadata;
			if (ownerId) {
				const ownerKeys = this.ownerIndex.get(ownerId);
				ownerKeys?.delete(id);
				if (ownerKeys?.size === 0) this.ownerIndex.delete(ownerId);
			}
			// Clean up tag index
			if (tags) {
				for (const tag of tags) {
					const tagKeys = this.tagIndex.get(tag);
					tagKeys?.delete(id);
					if (tagKeys?.size === 0) this.tagIndex.delete(tag);
				}
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
				// Clean up tag index
				if (record.metadata.tags) {
					for (const tag of record.metadata.tags) {
						const tagKeys = this.tagIndex.get(tag);
						tagKeys?.delete(id);
						if (tagKeys?.size === 0) this.tagIndex.delete(tag);
					}
				}
				this.keys.delete(id);
			}
		}
		this.ownerIndex.delete(ownerId);
	}

	async saveLog(log: AuditLog): Promise<void> {
		this.logs.set(log.id, log);
	}

	async findLogs(query: AuditLogQuery): Promise<AuditLog[]> {
		const logs = this.filterLogs(query);
		logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

		const offset = query.offset ?? 0;
		const limit = query.limit ?? DEFAULT_QUERY_LIMIT;
		return logs.slice(offset, offset + limit);
	}

	async countLogs(query: AuditLogQuery): Promise<number> {
		return this.filterLogs(query).length;
	}

	async deleteLogs(query: AuditLogQuery): Promise<number> {
		const logsToDelete = this.filterLogs(query);
		for (const log of logsToDelete) {
			this.logs.delete(log.id);
		}
		return logsToDelete.length;
	}

	async getLogStats(ownerId: string): Promise<AuditLogStats> {
		const logs = Array.from(this.logs.values()).filter(
			(log) => log.ownerId === ownerId
		);
		return calculateLogStats(logs);
	}

	private filterLogs(query: AuditLogQuery): AuditLog[] {
		let logs = Array.from(this.logs.values());

		if (query.keyId) logs = logs.filter((log) => log.keyId === query.keyId);
		if (query.ownerId)
			logs = logs.filter((log) => log.ownerId === query.ownerId);
		if (query.action) logs = logs.filter((log) => log.action === query.action);
		if (query.startDate)
			logs = logs.filter((log) => log.timestamp >= query.startDate!);
		if (query.endDate)
			logs = logs.filter((log) => log.timestamp <= query.endDate!);

		return logs;
	}
}
