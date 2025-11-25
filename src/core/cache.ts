import type Redis from "ioredis";

export type Cache = {
	get(key: string): Promise<string | null> | string | null;
	set(key: string, value: string, ttl?: number): Promise<void> | void;
	del(key: string): Promise<void> | void;
};

export type MemoryCacheOptions = {
	maxSize?: number;
	cleanupInterval?: number;
};

// biome-ignore lint/style/noMagicNumbers: Default cache configuration
const DEFAULT_MAX_SIZE = 10_000;
// biome-ignore lint/style/noMagicNumbers: Default cleanup interval (1 minute)
const DEFAULT_CLEANUP_INTERVAL = 60_000;

export class MemoryCache implements Cache {
	private readonly cache = new Map<
		string,
		{ value: string; expires: number }
	>();
	private readonly maxSize: number;
	private cleanupTimer: ReturnType<typeof setInterval> | null = null;

	constructor(options: MemoryCacheOptions = {}) {
		this.maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
		const cleanupInterval = options.cleanupInterval ?? DEFAULT_CLEANUP_INTERVAL;

		this.cleanupTimer = setInterval(() => this.cleanup(), cleanupInterval);
		this.cleanupTimer.unref?.();
	}

	get(key: string): string | null {
		const item = this.cache.get(key);
		if (!item) return null;

		if (item.expires < Date.now()) {
			this.cache.delete(key);
			return null;
		}
		return item.value;
	}

	set(key: string, value: string, ttl = 60): void {
		if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
			this.cleanup();
			if (this.cache.size >= this.maxSize) {
				const firstKey = this.cache.keys().next().value;
				if (firstKey !== undefined) this.cache.delete(firstKey);
			}
		}

		this.cache.set(key, {
			value,
			// biome-ignore lint/style/noMagicNumbers: Convert seconds to milliseconds
			expires: Date.now() + ttl * 1000,
		});
	}

	del(key: string): void {
		this.cache.delete(key);
	}

	clear(): void {
		this.cache.clear();
	}

	cleanup(): void {
		const now = Date.now();
		for (const [key, item] of this.cache) {
			if (item.expires < now) this.cache.delete(key);
		}
	}

	dispose(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = null;
		}
	}

	get size(): number {
		return this.cache.size;
	}
}

export class RedisCache implements Cache {
	private readonly client: Redis;

	constructor(client: Redis) {
		this.client = client;
	}

	async get(key: string): Promise<string | null> {
		return this.client.get(key);
	}

	async set(key: string, value: string, ttl = 60): Promise<void> {
		await this.client.setex(key, ttl, value);
	}

	async del(key: string): Promise<void> {
		await this.client.del(key);
	}
}
