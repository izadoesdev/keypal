import Redis from "ioredis";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { MemoryCache, RedisCache } from "./cache";

describe("MemoryCache", () => {
	let cache: MemoryCache;

	beforeEach(() => {
		cache = new MemoryCache();
	});

	it("should store and retrieve values", () => {
		cache.set("key1", "value1", 60);
		expect(cache.get("key1")).toBe("value1");
	});

	it("should return null for non-existent keys", () => {
		expect(cache.get("non-existent")).toBeNull();
	});

	it("should expire values after TTL", async () => {
		// biome-ignore lint/style/noMagicNumbers: 100ms
		cache.set("key1", "value1", 0.1);
		expect(cache.get("key1")).toBe("value1");

		// biome-ignore lint/style/noMagicNumbers: 150ms
		await new Promise((resolve) => setTimeout(resolve, 150));
		expect(cache.get("key1")).toBeNull();
	});

	it("should update existing values", () => {
		cache.set("key1", "value1", 60);
		cache.set("key1", "value2", 60);
		expect(cache.get("key1")).toBe("value2");
	});

	it("should delete values", () => {
		cache.set("key1", "value1", 60);
		cache.del("key1");
		expect(cache.get("key1")).toBeNull();
	});

	it("should clear all values", () => {
		cache.set("key1", "value1", 60);
		cache.set("key2", "value2", 60);
		cache.clear();
		expect(cache.get("key1")).toBeNull();
		expect(cache.get("key2")).toBeNull();
	});

	it("should handle multiple keys independently", () => {
		cache.set("key1", "value1", 60);
		cache.set("key2", "value2", 60);

		expect(cache.get("key1")).toBe("value1");
		expect(cache.get("key2")).toBe("value2");

		cache.del("key1");
		expect(cache.get("key1")).toBeNull();
		expect(cache.get("key2")).toBe("value2");
	});

	it("should increment a non-existent key to 1", () => {
		const result = cache.incr("counter", 60);
		expect(result).toBe(1);
		expect(cache.get("counter")).toBe("1");
	});

	it("should increment an existing key", () => {
		cache.set("counter", "5", 60);
		const result = cache.incr("counter", 60);
		// biome-ignore lint/style/noMagicNumbers: 6 is expected incremented value
		expect(result).toBe(6);
		expect(cache.get("counter")).toBe("6");
	});

	it("should increment multiple times", () => {
		expect(cache.incr("counter", 60)).toBe(1);
		expect(cache.incr("counter", 60)).toBe(2);
		// biome-ignore lint/style/noMagicNumbers: 3 is expected incremented value
		expect(cache.incr("counter", 60)).toBe(3);
		expect(cache.get("counter")).toBe("3");
	});

	it("should handle increment with TTL", async () => {
		// biome-ignore lint/style/noMagicNumbers: 100ms
		cache.incr("counter", 0.1);
		expect(cache.get("counter")).toBe("1");

		// biome-ignore lint/style/noMagicNumbers: 150ms
		await new Promise((resolve) => setTimeout(resolve, 150));
		expect(cache.get("counter")).toBeNull();
	});

	it("should not increment expired keys", async () => {
		// biome-ignore lint/style/noMagicNumbers: 100ms
		cache.set("counter", "5", 0.1);

		// biome-ignore lint/style/noMagicNumbers: 150ms
		await new Promise((resolve) => setTimeout(resolve, 150));

		const result = cache.incr("counter", 60);
		expect(result).toBe(1);
		expect(cache.get("counter")).toBe("1");
	});
});

describe("RedisCache", () => {
	let redis: Redis;
	let cache: RedisCache;

	beforeAll(async () => {
		redis = new Redis({
			host: process.env.REDIS_HOST || "localhost",
			port: Number.parseInt(process.env.REDIS_PORT || "6379", 10),
			db: 15, // Use test database
			connectTimeout: 2000,
			retryStrategy: () => null, // Don't retry
			lazyConnect: true,
			enableReadyCheck: false,
			maxRetriesPerRequest: 1,
		});

		try {
			await redis.connect();
			// Ping to verify connection
			await redis.ping();
		} catch (error) {
			console.warn(
				"Redis not available. Skipping Redis tests. Start with: bun run redis:up"
			);
			throw error;
		}
	});

	beforeEach(async () => {
		await redis.flushdb();
		cache = new RedisCache(redis);
		vi.restoreAllMocks();
	});

	afterAll(async () => {
		await redis.flushdb();
		await redis.quit();
	});

	it("should call redis get", async () => {
		await redis.set("key1", "value1");
		const spyRedisGet = vi.spyOn(redis, "get");

		const result = await cache.get("key1");
		expect(result).toBe("value1");

		expect(spyRedisGet).toHaveBeenCalledWith("key1");
	});

	it("should call redis setex with TTL", async () => {
		const spyRedisSetex = vi.spyOn(redis, "setex");

		// biome-ignore lint/style/noMagicNumbers: 120 seconds
		await cache.set("key1", "value1", 120);

		// biome-ignore lint/style/noMagicNumbers: 120 seconds
		expect(spyRedisSetex).toHaveBeenCalledWith("key1", 120, "value1");
	});

	it("should call redis del", async () => {
		const spyRedisDel = vi.spyOn(redis, "del");
		await cache.del("key1");

		expect(spyRedisDel).toHaveBeenCalledWith("key1");
	});

	it("should return null for non-existent keys", async () => {
		const result = await cache.get("non-existent");
		expect(result).toBeNull();
	});

	it("should call redis eval with Lua script for incr", async () => {
		const spyRedisEval = vi.spyOn(redis, "eval");
		await redis.set("counter", "4");

		// biome-ignore lint/style/noMagicNumbers: 120 seconds
		const result = await cache.incr("counter", 120);

		// biome-ignore lint/style/noMagicNumbers: 5 as the incremented value
		expect(result).toBe(5);
		expect(spyRedisEval).toHaveBeenCalledWith(
			expect.stringContaining("INCR"),
			1,
			"counter",
			// biome-ignore lint/style/noMagicNumbers: 120 seconds
			120
		);
	});

	it("should handle incr returning number", async () => {
		await redis.set("new-counter", "0");

		const result = await cache.incr("new-counter", 60);
		expect(result).toBe(1);
		expect(typeof result).toBe("number");
	});
});
