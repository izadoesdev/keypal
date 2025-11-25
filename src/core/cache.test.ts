import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryCache, RedisCache } from "./cache";

describe("MemoryCache", () => {
	let cache: MemoryCache;

	beforeEach(() => {
		cache = new MemoryCache({ cleanupInterval: 60_000 });
	});

	afterEach(() => {
		cache.dispose();
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

	it("should respect max size limit", () => {
		const smallCache = new MemoryCache({ maxSize: 3, cleanupInterval: 60_000 });

		smallCache.set("key1", "value1", 60);
		smallCache.set("key2", "value2", 60);
		smallCache.set("key3", "value3", 60);
		expect(smallCache.size).toBe(3);

		smallCache.set("key4", "value4", 60);
		expect(smallCache.size).toBe(3);
		expect(smallCache.get("key4")).toBe("value4");

		smallCache.dispose();
	});

	it("should evict expired entries before evicting by LRU", async () => {
		const smallCache = new MemoryCache({ maxSize: 2, cleanupInterval: 60_000 });

		// biome-ignore lint/style/noMagicNumbers: Short TTL for test
		smallCache.set("expiring", "will expire", 0.05);
		smallCache.set("permanent", "stays", 60);

		// biome-ignore lint/style/noMagicNumbers: Wait for expiry
		await new Promise((resolve) => setTimeout(resolve, 100));

		smallCache.set("new", "entry", 60);

		expect(smallCache.get("expiring")).toBeNull();
		expect(smallCache.get("permanent")).toBe("stays");
		expect(smallCache.get("new")).toBe("entry");

		smallCache.dispose();
	});

	it("should cleanup expired entries", async () => {
		// biome-ignore lint/style/noMagicNumbers: Short TTL for test
		cache.set("expiring1", "value1", 0.05);
		// biome-ignore lint/style/noMagicNumbers: Short TTL for test
		cache.set("expiring2", "value2", 0.05);
		cache.set("permanent", "value3", 60);

		expect(cache.size).toBe(3);

		// biome-ignore lint/style/noMagicNumbers: Wait for expiry
		await new Promise((resolve) => setTimeout(resolve, 100));

		cache.cleanup();

		expect(cache.size).toBe(1);
		expect(cache.get("permanent")).toBe("value3");
	});

	it("should report size correctly", () => {
		expect(cache.size).toBe(0);
		cache.set("key1", "value1", 60);
		expect(cache.size).toBe(1);
		cache.set("key2", "value2", 60);
		expect(cache.size).toBe(2);
		cache.del("key1");
		expect(cache.size).toBe(1);
	});

	it("should allow updating existing key without eviction", () => {
		const smallCache = new MemoryCache({ maxSize: 2, cleanupInterval: 60_000 });

		smallCache.set("key1", "value1", 60);
		smallCache.set("key2", "value2", 60);
		expect(smallCache.size).toBe(2);

		smallCache.set("key1", "updated", 60);
		expect(smallCache.size).toBe(2);
		expect(smallCache.get("key1")).toBe("updated");
		expect(smallCache.get("key2")).toBe("value2");

		smallCache.dispose();
	});
});

describe("RedisCache", () => {
	let mockRedisClient: any;
	let cache: RedisCache;

	beforeEach(() => {
		mockRedisClient = {
			get: vi.fn(),
			setex: vi.fn(),
			del: vi.fn(),
		};
		cache = new RedisCache(mockRedisClient);
	});

	it("should call redis get", async () => {
		mockRedisClient.get.mockResolvedValue("value1");

		const result = await cache.get("key1");
		expect(result).toBe("value1");
		expect(mockRedisClient.get).toHaveBeenCalledWith("key1");
	});

	it("should call redis setex with TTL", async () => {
		// biome-ignore lint/style/noMagicNumbers: 120 seconds
		await cache.set("key1", "value1", 120);

		// biome-ignore lint/style/noMagicNumbers: 120 seconds
		expect(mockRedisClient.setex).toHaveBeenCalledWith("key1", 120, "value1");
	});

	it("should call redis del", async () => {
		await cache.del("key1");

		expect(mockRedisClient.del).toHaveBeenCalledWith("key1");
	});

	it("should return null for non-existent keys", async () => {
		mockRedisClient.get.mockResolvedValue(null);

		const result = await cache.get("non-existent");
		expect(result).toBeNull();
	});
});
