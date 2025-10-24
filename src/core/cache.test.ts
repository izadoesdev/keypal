import { beforeEach, describe, expect, it, vi } from "vitest";
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
