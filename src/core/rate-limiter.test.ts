import Redis from "ioredis";
import { beforeEach, describe, expect, it } from "vitest";
import { createKeys } from "../manager";
import type { ApiKeyRecord } from "../types/api-key-types";

describe("RateLimiter", () => {
	let keys: ReturnType<typeof createKeys>;
	let apiKeyRecord: ApiKeyRecord;

	beforeEach(async () => {
		keys = createKeys({
			cache: true,
			cacheTtl: 60,
		});

		const { record } = await keys.create({
			ownerId: "user_123",
			name: "Test Key",
		});
		apiKeyRecord = record;
	});

	it("should allow requests within limit", async () => {
		const rateLimiter = keys.createRateLimiter({
			maxRequests: 10,
			windowMs: 60_000,
		});

		const result = await rateLimiter.check(apiKeyRecord);

		const REMAINING_REQUESTS = 10 - 1;

		expect(result.allowed).toBe(true);
		expect(result.current).toBe(1);
		expect(result.limit).toBe(10);
		expect(result.remaining).toBe(REMAINING_REQUESTS);
	});

	it("should block requests exceeding limit", async () => {
		const rateLimiter = keys.createRateLimiter({
			maxRequests: 5,
			windowMs: 60_000,
		});

		// Make 5 requests to hit the limit
		const REQUEST_COUNT = 5;
		for (let i = 0; i < REQUEST_COUNT; i++) {
			await rateLimiter.check(apiKeyRecord);
		}

		// 6th request should be blocked
		const result = await rateLimiter.check(apiKeyRecord);

		expect(result.allowed).toBe(false);
		// With atomic increment, the counter increments before checking,
		// so the 6th request will show current: 6
		expect(result.current).toBe(REQUEST_COUNT + 1);
		expect(result.remaining).toBe(0);
	});

	it("should reset the rate limit after the window expires", async () => {
		const rateLimiter = keys.createRateLimiter({
			maxRequests: 3,
			windowMs: 2000,
		});

		await rateLimiter.check(apiKeyRecord);
		await rateLimiter.check(apiKeyRecord);
		await rateLimiter.check(apiKeyRecord);

		// Wait for the window to expire
		const WAIT_TIME_MS = 2000;
		await new Promise((resolve) => setTimeout(resolve, WAIT_TIME_MS));

		await rateLimiter.check(apiKeyRecord);
		const result = await rateLimiter.check(apiKeyRecord);

		expect(result.allowed).toBe(true);
		expect(result.current).toBe(2);
		expect(result.remaining).toBe(1);
	});

	it("should check limit without incrementing when increment is false", async () => {
		const rateLimiter = keys.createRateLimiter({
			maxRequests: 3,
			windowMs: 2000,
		});

		await rateLimiter.check(apiKeyRecord);
		await rateLimiter.check(apiKeyRecord);

		const dryRun = await rateLimiter.check(apiKeyRecord, { increment: false });
		expect(dryRun.allowed).toBe(true);
		expect(dryRun.remaining).toBe(1);

		const verify = await rateLimiter.check(apiKeyRecord, { increment: false });
		expect(verify.remaining).toBe(1);
	});

	it("should check limit with custom identifier", async () => {
		const rateLimiter = keys.createRateLimiter({
			maxRequests: 3,
			windowMs: 2000,
		});

		const result = await rateLimiter.check(apiKeyRecord, {
			identifier: "custom_identifier",
		});
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(2);
	});

	it("should reset the rate limit", async () => {
		const rateLimiter = keys.createRateLimiter({
			maxRequests: 3,
			windowMs: 2000,
		});

		const REMAINING_REQUESTS = 3;

		await rateLimiter.check(apiKeyRecord);
		await rateLimiter.check(apiKeyRecord);
		await rateLimiter.reset(apiKeyRecord);

		const result = await rateLimiter.check(apiKeyRecord);
		expect(result.allowed).toBe(true);
		expect(result.current).toBe(1);
		expect(result.remaining).toBe(REMAINING_REQUESTS - 1);
	});

	it("should get current count", async () => {
		const rateLimiter = keys.createRateLimiter({
			maxRequests: 3,
			windowMs: 2000,
		});

		await rateLimiter.check(apiKeyRecord);
		await rateLimiter.check(apiKeyRecord);

		const count = await rateLimiter.getCurrentCount(apiKeyRecord);
		expect(count).toBe(2);
	});

	it("should test for multiple keys not interfering", async () => {
		const { record: apiKeyRecord2 } = await keys.create({
			ownerId: "user_123",
			name: "Test Key 2",
		});

		const REMAINING_REQUESTS = 3;

		const rateLimiter = keys.createRateLimiter({
			maxRequests: 3,
			windowMs: 2000,
		});

		await rateLimiter.check(apiKeyRecord);
		await rateLimiter.check(apiKeyRecord);

		const result = await rateLimiter.check(apiKeyRecord2);
		expect(result.allowed).toBe(true);
		expect(result.current).toBe(1);
		expect(result.remaining).toBe(REMAINING_REQUESTS - 1);
	});

	it("should work with RedisCache", async () => {
		const redis = new Redis({
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
			await redis.ping();
		} catch {
			it.skip(
				"Redis not available. Skipping Redis tests. Start with: bun run redis:up"
			);
			return;
		}

		const keyManager = createKeys({
			cache: "redis",
			redis,
		});

		const rateLimiter = keyManager.createRateLimiter({
			maxRequests: 3,
			windowMs: 2000,
		});

		const result = await rateLimiter.check(apiKeyRecord);
		expect(result.allowed).toBe(true);
		expect(result.current).toBe(1);
		expect(result.remaining).toBe(2);

		await redis.quit();
	});
});
