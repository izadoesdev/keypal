import type Redis from "ioredis";
import type { ChainableCommander } from "ioredis";
import type { ApiKeyMetadata, ApiKeyRecord } from "../types/api-key-types";
import type { Storage } from "../types/storage-types";

function isValidApiKeyRecord(data: unknown): data is ApiKeyRecord {
	if (typeof data !== "object" || data === null) return false;
	const record = data as Record<string, unknown>;
	return (
		typeof record.id === "string" &&
		typeof record.keyHash === "string" &&
		typeof record.metadata === "object" &&
		record.metadata !== null
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

	async save(record: ApiKeyRecord): Promise<void> {
		if (await this.findById(record.id)) {
			throw new Error(`API key with id ${record.id} already exists`);
		}

		const pipeline = this.redis.pipeline();
		pipeline.set(this.key(record.id), JSON.stringify(record));
		pipeline.set(this.hashKey(record.keyHash), record.id);
		pipeline.sadd(this.ownerKey(record.metadata.ownerId), record.id);

		if (record.metadata.tags?.length) {
			for (const tag of record.metadata.tags) {
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

	async updateMetadata(
		id: string,
		metadata: Partial<ApiKeyMetadata>
	): Promise<void> {
		const record = await this.findById(id);
		if (!record) throw new Error(`API key with id ${id} not found`);

		const oldTags = record.metadata.tags ?? [];
		record.metadata = { ...record.metadata, ...metadata };
		const newTags = record.metadata.tags ?? [];

		const pipeline = this.redis.pipeline();
		pipeline.set(this.key(id), JSON.stringify(record));

		if (metadata.revokedAt) {
			pipeline.del(this.hashKey(record.keyHash));
		}

		if (metadata.tags !== undefined) {
			const oldTagsSet = new Set(oldTags.map((t) => t.toLowerCase()));
			const newTagsSet = new Set(newTags.map((t) => t.toLowerCase()));

			for (const tag of oldTagsSet) {
				if (!newTagsSet.has(tag)) pipeline.srem(this.tagKey(tag), id);
			}
			for (const tag of newTagsSet) {
				if (!oldTagsSet.has(tag)) pipeline.sadd(this.tagKey(tag), id);
			}
		}

		await execPipeline(pipeline, "updateMetadata");
	}

	async delete(id: string): Promise<void> {
		const record = await this.findById(id);
		if (!record) return;

		const pipeline = this.redis.pipeline();
		pipeline.del(this.key(id));
		pipeline.del(this.hashKey(record.keyHash));
		pipeline.srem(this.ownerKey(record.metadata.ownerId), id);

		if (record.metadata.tags?.length) {
			for (const tag of record.metadata.tags) {
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
					if (record.metadata.tags?.length) {
						for (const tag of record.metadata.tags) {
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
}
