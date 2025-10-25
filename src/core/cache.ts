import type Redis from "ioredis";

export type Cache = {
	get(key: string): Promise<string | null> | string | null;
	set(key: string, value: string, ttl?: number): Promise<void> | void;
	del(key: string): Promise<void> | void;
	/**
	 * Atomically increments the value at key by 1 and returns the new value.
	 * If the key doesn't exist, it's set to 1.
	 * @param key - The cache key
	 * @param ttl - Time to live in seconds
	 * @returns The new value after incrementing
	 */
	incr(key: string, ttl?: number): Promise<number> | number;
};

export class MemoryCache implements Cache {
	private readonly cache = new Map<
		string,
		{ value: string; expires: number }
	>();

	get(key: string): string | null {
		const item = this.cache.get(key);
		if (!item) {
			return null;
		}

		if (item.expires < Date.now()) {
			this.cache.delete(key);
			return null;
		}

		return item.value;
	}

	set(key: string, value: string, ttl = 60): void {
		this.cache.set(key, {
			value,
			// biome-ignore lint/style/noMagicNumbers: 1000ms to seconds
			expires: Date.now() + ttl * 1000,
		});
	}

	del(key: string): void {
		this.cache.delete(key);
	}

	incr(key: string, ttl = 60): number {
		const item = this.cache.get(key);
		const currentValue =
			item && item.expires >= Date.now() ? Number.parseInt(item.value, 10) : 0;
		const newValue = currentValue + 1;

		this.cache.set(key, {
			value: String(newValue),
			// biome-ignore lint/style/noMagicNumbers: 1000ms to seconds
			expires: Date.now() + ttl * 1000,
		});

		return newValue;
	}

	clear(): void {
		this.cache.clear();
	}
}

export class RedisCache implements Cache {
	private readonly client: Redis;

	constructor(client: Redis) {
		this.client = client;
	}

	async get(key: string): Promise<string | null> {
		return await this.client.get(key);
	}

	async set(key: string, value: string, ttl = 60): Promise<void> {
		await this.client.setex(key, ttl, value);
	}

	async del(key: string): Promise<void> {
		await this.client.del(key);
	}

	async incr(key: string, ttl = 60): Promise<number> {
		// Use Redis INCR which is atomic, then set TTL
		// Using a Lua script ensures both operations are atomic
		const script = `
			local count = redis.call('INCR', KEYS[1])
			redis.call('EXPIRE', KEYS[1], ARGV[1])
			return count
		`;

		const result = await this.client.eval(script, 1, key, ttl);
		return Number(result);
	}
}
