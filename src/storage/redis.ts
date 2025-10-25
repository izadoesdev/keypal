import type Redis from "ioredis";
import type { ApiKeyMetadata, ApiKeyRecord } from "../types/api-key-types";
import type { Storage } from "../types/storage-types";

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
		const existing = await this.findById(record.id);
		if (existing) {
			throw new Error(`API key with id ${record.id} already exists`);
		}

		const pipeline = this.redis.pipeline();
		pipeline.set(this.key(record.id), JSON.stringify(record));
		pipeline.set(this.hashKey(record.keyHash), record.id);
		pipeline.sadd(this.ownerKey(record.metadata.ownerId), record.id);

		if (record.metadata.tags && record.metadata.tags.length > 0) {
			for (const tag of record.metadata.tags) {
				pipeline.sadd(this.tagKey(tag.toLowerCase()), record.id);
			}
		}

		await pipeline.exec();
	}

	async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
		const id = await this.redis.get(this.hashKey(keyHash));
		if (!id) {
			return null;
		}
		return this.findById(id);
	}

	async findById(id: string): Promise<ApiKeyRecord | null> {
		const data = await this.redis.get(this.key(id));
		if (!data) {
			return null;
		}
		return JSON.parse(data);
	}

	async findByOwner(ownerId: string): Promise<ApiKeyRecord[]> {
		const ids = await this.redis.smembers(this.ownerKey(ownerId));
		if (ids.length === 0) {
			return [];
		}

		const pipeline = this.redis.pipeline();
		for (const id of ids) {
			pipeline.get(this.key(id));
		}
		const results = await pipeline.exec();

		return (
			results
				?.map((result) =>
					result?.[1] ? JSON.parse(result[1] as string) : null
				)
				.filter((record): record is ApiKeyRecord => record !== null) ?? []
		);
	}

	async findByTag(
		tag: string | string[],
		ownerId?: string
	): Promise<ApiKeyRecord[]> {
		const tags = Array.isArray(tag) ? tag : [tag];
		const tagKeys = tags.map((t) => this.tagKey(t.toLowerCase()));

		if (tagKeys.length === 0) {
			return [];
		}

		let tagIds =
			tagKeys.length === 1
				? await this.redis.smembers(tagKeys[0])
				: await this.redis.sunion(...tagKeys);

		if (ownerId !== undefined && tagIds.length > 0) {
			const ownerIds = await this.redis.smembers(this.ownerKey(ownerId));
			tagIds = tagIds.filter((id) => ownerIds.includes(id));
		}

		if (tagIds.length === 0) {
			return [];
		}

		const pipeline = this.redis.pipeline();
		for (const id of tagIds) {
			pipeline.get(this.key(id));
		}

		const results = await pipeline.exec();
		return (
			results
				?.map((result) =>
					result?.[1] ? JSON.parse(result[1] as string) : null
				)
				.filter((record): record is ApiKeyRecord => record !== null) ?? []
		);
	}

	async updateMetadata(
		id: string,
		metadata: Partial<ApiKeyMetadata>
	): Promise<void> {
		const record = await this.findById(id);
		if (!record) {
			throw new Error(`API key with id ${id} not found`);
		}

		record.metadata = { ...record.metadata, ...metadata };
		await this.redis.set(this.key(id), JSON.stringify(record));

		if (metadata.revokedAt) {
			await this.redis.del(this.hashKey(record.keyHash));
		}
	}

	async delete(id: string): Promise<void> {
		const record = await this.findById(id);
		if (!record) {
			return;
		}

		const pipeline = this.redis.pipeline();
		pipeline.del(this.key(id));
		pipeline.del(this.hashKey(record.keyHash));
		pipeline.srem(this.ownerKey(record.metadata.ownerId), id);

		if (record.metadata.tags && record.metadata.tags.length > 0) {
			for (const tag of record.metadata.tags) {
				pipeline.srem(this.tagKey(tag.toLowerCase()), id);
			}
		}

		await pipeline.exec();
	}

	async deleteByOwner(ownerId: string): Promise<void> {
		const ids = await this.redis.smembers(this.ownerKey(ownerId));
		if (ids.length === 0) {
			return;
		}

		const pipeline = this.redis.pipeline();
		for (const id of ids) {
			const record = await this.findById(id);
			if (record) {
				pipeline.del(this.key(id));
				pipeline.del(this.hashKey(record.keyHash));
				if (record.metadata.tags && record.metadata.tags.length > 0) {
					for (const tag of record.metadata.tags) {
						pipeline.srem(this.tagKey(tag.toLowerCase()), id);
					}
				}
			}
		}
		pipeline.del(this.ownerKey(ownerId));
		await pipeline.exec();
	}

	async setTtl(id: string, ttlSeconds: number): Promise<void> {
		const record = await this.findById(id);
		if (!record) {
			return;
		}

		const pipeline = this.redis.pipeline();
		pipeline.expire(this.key(id), ttlSeconds);
		pipeline.expire(this.hashKey(record.keyHash), ttlSeconds);
		await pipeline.exec();
	}
}
