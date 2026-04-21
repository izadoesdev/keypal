import type Redis from "ioredis";
import type { ChainableCommander } from "ioredis";
import type { ApiKeyMutableFields, ApiKeyRecord } from "../types/api-key-types";
import type {
	AuditLog,
	AuditLogQuery,
	AuditLogStats,
} from "../types/audit-log-types";
import type { Storage } from "../types/storage-types";
import { DEFAULT_QUERY_LIMIT, calculateLogStats } from "./utils";

function isValidApiKeyRecord(data: unknown): data is ApiKeyRecord {
	if (typeof data !== "object" || data === null) return false;
	const record = data as Record<string, unknown>;
	return (
		typeof record.id === "string" &&
		typeof record.keyHash === "string" &&
		typeof record.ownerId === "string"
	);
}

function isValidAuditLog(data: unknown): data is AuditLog {
	if (typeof data !== "object" || data === null) return false;
	const log = data as Record<string, unknown>;
	return (
		typeof log.id === "string" &&
		typeof log.keyId === "string" &&
		typeof log.ownerId === "string" &&
		typeof log.action === "string" &&
		typeof log.timestamp === "string"
	);
}

async function execPipeline(
	pipeline: ChainableCommander,
	operation: string
): Promise<Array<[Error | null, unknown]>> {
	const results = await pipeline.exec();
	if (!results) {
		throw new Error(`Redis pipeline returned null for ${operation}`);
	}

	for (let i = 0; i < results.length; i++) {
		const result = results[i];
		if (result?.[0]) {
			throw new Error(
				`Redis pipeline command ${i} failed in ${operation}: ${result[0].message}`
			);
		}
	}
	return results;
}

function parseRecord(data: string): ApiKeyRecord | null {
	try {
		const parsed: unknown = JSON.parse(data);
		return isValidApiKeyRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function parseAuditLog(data: string): AuditLog | null {
	try {
		const parsed: unknown = JSON.parse(data);
		return isValidAuditLog(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

export class RedisStore implements Storage {
	private readonly redis: Redis;
	private readonly prefix: string;

	constructor(options: { client: Redis; prefix?: string }) {
		this.redis = options.client;
		this.prefix = options.prefix ?? "apikey:";
	}

	private key(id: string): string {
		return `${this.prefix}${id}`;
	}

	private tagKey(tag: string): string {
		return `${this.prefix}tag:${tag}`;
	}

	private hashKey(hash: string): string {
		return `${this.prefix}hash:${hash}`;
	}

	private ownerKey(ownerId: string): string {
		return `${this.prefix}owner:${ownerId}`;
	}

	private logKey(id: string): string {
		return `${this.prefix}log:${id}`;
	}

	private logsByKeyIndex(keyId: string): string {
		return `${this.prefix}logs:key:${keyId}`;
	}

	private logsByOwnerIndex(ownerId: string): string {
		return `${this.prefix}logs:owner:${ownerId}`;
	}

	private logsByActionIndex(action: string): string {
		return `${this.prefix}logs:action:${action}`;
	}

	private allLogsIndex(): string {
		return `${this.prefix}logs:all`;
	}

	async save(record: ApiKeyRecord): Promise<void> {
		if (await this.findById(record.id)) {
			throw new Error(`API key with id ${record.id} already exists`);
		}

		const pipeline = this.redis.pipeline();
		pipeline.set(this.key(record.id), JSON.stringify(record));
		pipeline.set(this.hashKey(record.keyHash), record.id);
		pipeline.sadd(this.ownerKey(record.ownerId), record.id);

		if (record.tags?.length) {
			for (const tag of record.tags) {
				pipeline.sadd(this.tagKey(tag.toLowerCase()), record.id);
			}
		}

		await execPipeline(pipeline, "save");
	}

	async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
		const id = await this.redis.get(this.hashKey(keyHash));
		return id ? this.findById(id) : null;
	}

	async findById(id: string): Promise<ApiKeyRecord | null> {
		const data = await this.redis.get(this.key(id));
		return data ? parseRecord(data) : null;
	}

	async findByOwner(ownerId: string): Promise<ApiKeyRecord[]> {
		const ids = await this.redis.smembers(this.ownerKey(ownerId));
		if (!ids.length) return [];

		const pipeline = this.redis.pipeline();
		for (const id of ids) {
			pipeline.get(this.key(id));
		}
		const results = await execPipeline(pipeline, "findByOwner");

		const records: ApiKeyRecord[] = [];
		for (const result of results) {
			if (result[1]) {
				const record = parseRecord(result[1] as string);
				if (record) records.push(record);
			}
		}
		return records;
	}

	async findByTags(tags: string[], ownerId?: string): Promise<ApiKeyRecord[]> {
		const tagKeys = tags.map((t) => this.tagKey(t.toLowerCase()));
		if (!tagKeys.length) return [];

		let tagIds =
			tagKeys.length === 1 && tagKeys[0]
				? await this.redis.smembers(tagKeys[0])
				: await this.redis.sunion(...tagKeys);

		if (ownerId !== undefined && tagIds.length) {
			const ownerIds = await this.redis.smembers(this.ownerKey(ownerId));
			tagIds = tagIds.filter((id) => ownerIds.includes(id));
		}

		if (!tagIds.length) return [];

		const pipeline = this.redis.pipeline();
		for (const id of tagIds) {
			pipeline.get(this.key(id));
		}
		const results = await execPipeline(pipeline, "findByTags");

		const records: ApiKeyRecord[] = [];
		for (const result of results) {
			if (result[1]) {
				const record = parseRecord(result[1] as string);
				if (record) records.push(record);
			}
		}
		return records;
	}

	async findByTag(tag: string, ownerId?: string): Promise<ApiKeyRecord[]> {
		return this.findByTags([tag], ownerId);
	}

	async update(
		id: string,
		fields: Partial<ApiKeyMutableFields>
	): Promise<void> {
		const record = await this.findById(id);
		if (!record) throw new Error(`API key with id ${id} not found`);

		const oldTags = record.tags ?? [];
		Object.assign(record, fields);
		const newTags = record.tags ?? [];

		const pipeline = this.redis.pipeline();
		pipeline.set(this.key(id), JSON.stringify(record));

		if (fields.revokedAt) {
			pipeline.del(this.hashKey(record.keyHash));
		}

		if (fields.tags !== undefined) {
			const oldTagsSet = new Set(oldTags.map((t) => t.toLowerCase()));
			const newTagsSet = new Set(newTags.map((t) => t.toLowerCase()));

			for (const tag of oldTagsSet) {
				if (!newTagsSet.has(tag)) pipeline.srem(this.tagKey(tag), id);
			}
			for (const tag of newTagsSet) {
				if (!oldTagsSet.has(tag)) pipeline.sadd(this.tagKey(tag), id);
			}
		}

		await execPipeline(pipeline, "update");
	}

	async delete(id: string): Promise<void> {
		const record = await this.findById(id);
		if (!record) return;

		const pipeline = this.redis.pipeline();
		pipeline.del(this.key(id));
		pipeline.del(this.hashKey(record.keyHash));
		pipeline.srem(this.ownerKey(record.ownerId), id);

		if (record.tags?.length) {
			for (const tag of record.tags) {
				pipeline.srem(this.tagKey(tag.toLowerCase()), id);
			}
		}

		await execPipeline(pipeline, "delete");
	}

	async deleteByOwner(ownerId: string): Promise<void> {
		const ids = await this.redis.smembers(this.ownerKey(ownerId));
		if (!ids.length) return;

		const pipeline = this.redis.pipeline();
		for (const id of ids) {
			pipeline.get(this.key(id));
		}
		const recordResults = await execPipeline(pipeline, "deleteByOwner:fetch");

		const deletePipeline = this.redis.pipeline();
		for (let i = 0; i < ids.length; i++) {
			const id = ids[i];
			if (!id) continue;

			deletePipeline.del(this.key(id));

			const result = recordResults[i];
			if (result?.[1]) {
				const record = parseRecord(result[1] as string);
				if (record) {
					deletePipeline.del(this.hashKey(record.keyHash));
					if (record.tags?.length) {
						for (const tag of record.tags) {
							deletePipeline.srem(this.tagKey(tag.toLowerCase()), id);
						}
					}
				}
			}
		}
		deletePipeline.del(this.ownerKey(ownerId));
		await execPipeline(deletePipeline, "deleteByOwner:delete");
	}

	async setTtl(id: string, ttlSeconds: number): Promise<void> {
		const record = await this.findById(id);
		if (!record) return;

		const pipeline = this.redis.pipeline();
		pipeline.expire(this.key(id), ttlSeconds);
		pipeline.expire(this.hashKey(record.keyHash), ttlSeconds);
		await execPipeline(pipeline, "setTtl");
	}

	async saveLog(log: AuditLog): Promise<void> {
		const score = new Date(log.timestamp).getTime();
		const pipeline = this.redis.pipeline();

		pipeline.set(this.logKey(log.id), JSON.stringify(log));
		pipeline.zadd(this.allLogsIndex(), score, log.id);
		pipeline.zadd(this.logsByKeyIndex(log.keyId), score, log.id);
		pipeline.zadd(this.logsByOwnerIndex(log.ownerId), score, log.id);
		pipeline.zadd(this.logsByActionIndex(log.action), score, log.id);

		await execPipeline(pipeline, "saveLog");
	}

	async findLogs(query: AuditLogQuery): Promise<AuditLog[]> {
		const offset = query.offset ?? 0;
		const limit = query.limit ?? DEFAULT_QUERY_LIMIT;

		let indexKey: string;
		if (query.keyId) {
			indexKey = this.logsByKeyIndex(query.keyId);
		} else if (query.ownerId) {
			indexKey = this.logsByOwnerIndex(query.ownerId);
		} else if (query.action) {
			indexKey = this.logsByActionIndex(query.action);
		} else {
			indexKey = this.allLogsIndex();
		}

		const minScore = query.startDate
			? new Date(query.startDate).getTime()
			: "-inf";
		const maxScore = query.endDate
			? new Date(query.endDate).getTime()
			: "+inf";

		const logIds = await this.redis.zrevrangebyscore(
			indexKey,
			maxScore,
			minScore,
			"LIMIT",
			offset,
			limit
		);

		if (!logIds.length) return [];

		const pipeline = this.redis.pipeline();
		for (const id of logIds) {
			pipeline.get(this.logKey(id));
		}
		const results = await execPipeline(pipeline, "findLogs");

		const logs: AuditLog[] = [];
		for (const result of results) {
			if (result[1]) {
				const log = parseAuditLog(result[1] as string);
				if (log && this.matchesQuery(log, query)) {
					logs.push(log);
				}
			}
		}

		return logs;
	}

	async countLogs(query: AuditLogQuery): Promise<number> {
		let indexKey: string;
		if (query.keyId) {
			indexKey = this.logsByKeyIndex(query.keyId);
		} else if (query.ownerId) {
			indexKey = this.logsByOwnerIndex(query.ownerId);
		} else if (query.action) {
			indexKey = this.logsByActionIndex(query.action);
		} else {
			indexKey = this.allLogsIndex();
		}

		const minScore = query.startDate
			? new Date(query.startDate).getTime()
			: "-inf";
		const maxScore = query.endDate
			? new Date(query.endDate).getTime()
			: "+inf";

		const hasMultipleFilters =
			[query.keyId, query.ownerId, query.action].filter(Boolean).length > 1;

		if (!hasMultipleFilters) {
			return this.redis.zcount(indexKey, minScore, maxScore);
		}

		const logs = await this.findLogs({
			...query,
			limit: Number.MAX_SAFE_INTEGER,
			offset: 0,
		});
		return logs.length;
	}

	async deleteLogs(query: AuditLogQuery): Promise<number> {
		const logs = await this.findLogs({
			...query,
			limit: Number.MAX_SAFE_INTEGER,
			offset: 0,
		});
		if (!logs.length) return 0;

		const pipeline = this.redis.pipeline();
		for (const log of logs) {
			pipeline.del(this.logKey(log.id));
			pipeline.zrem(this.allLogsIndex(), log.id);
			pipeline.zrem(this.logsByKeyIndex(log.keyId), log.id);
			pipeline.zrem(this.logsByOwnerIndex(log.ownerId), log.id);
			pipeline.zrem(this.logsByActionIndex(log.action), log.id);
		}

		await execPipeline(pipeline, "deleteLogs");
		return logs.length;
	}

	async getLogStats(ownerId: string): Promise<AuditLogStats> {
		const logs = await this.findLogs({
			ownerId,
			limit: Number.MAX_SAFE_INTEGER,
		});
		return calculateLogStats(logs);
	}

	private matchesQuery(log: AuditLog, query: AuditLogQuery): boolean {
		if (query.keyId && log.keyId !== query.keyId) return false;
		if (query.ownerId && log.ownerId !== query.ownerId) return false;
		if (query.action && log.action !== query.action) return false;
		if (query.startDate && log.timestamp < query.startDate) return false;
		if (query.endDate && log.timestamp > query.endDate) return false;
		return true;
	}
}
