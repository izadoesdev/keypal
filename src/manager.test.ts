import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryCache } from "./core/cache";
import { createKeys } from "./manager";
import { MemoryStore } from "./storage/memory";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T/;
const SK_TEST_PREFIX_REGEX = /^sk_test_/;

describe("ApiKeyManager", () => {
	let keys: ReturnType<typeof createKeys>;
	let storage: MemoryStore;

	beforeEach(() => {
		storage = new MemoryStore();
		keys = createKeys({
			prefix: "sk_test_",
			length: 32,
			algorithm: "sha256",
			storage,
		});
	});

	describe("key generation", () => {
		it("should generate a key with configured prefix", () => {
			const key = keys.generateKey();
			expect(key.startsWith("sk_test_")).toBe(true);
		});

		it("should generate unique keys", () => {
			const key1 = keys.generateKey();
			const key2 = keys.generateKey();
			expect(key1).not.toBe(key2);
		});

		it("should generate keys without prefix when not configured", () => {
			const managerNoPrefix = createKeys({ length: 32 });
			const key = managerNoPrefix.generateKey();
			expect(key).toBeDefined();
			expect(key.length).toBeGreaterThan(0);
		});
	});

	describe("key hashing", () => {
		it("should hash a key with configured algorithm", () => {
			const key = "test-key-123";
			const hash = keys.hashKey(key);

			expect(hash).toBeDefined();
			// biome-ignore lint/style/noMagicNumbers: 64 characters default
			expect(hash.length).toBe(64);
		});

		it("should produce consistent hashes", () => {
			const key = "test-key-123";
			const hash1 = keys.hashKey(key);
			const hash2 = keys.hashKey(key);

			expect(hash1).toBe(hash2);
		});

		it("should use sha512 when configured", () => {
			const manager512 = createKeys({ algorithm: "sha512" });

			const key = "test-key-123";
			const hash = manager512.hashKey(key);

			// biome-ignore lint/style/noMagicNumbers: 128 characters default
			expect(hash.length).toBe(128);
		});
	});

	describe("key validation", () => {
		it("should validate a correct key", () => {
			const key = "test-key-123";
			const hash = keys.hashKey(key);

			const isValid = keys.validateKey(key, hash);
			expect(isValid).toBe(true);
		});

		it("should reject an incorrect key", () => {
			const key = "test-key-123";
			const wrongKey = "test-key-456";
			const hash = keys.hashKey(key);

			const isValid = keys.validateKey(wrongKey, hash);
			expect(isValid).toBe(false);
		});

		it("should validate with sha512 algorithm", () => {
			const manager512 = createKeys({ algorithm: "sha512", storage });
			const key = "test-key-123";
			const hash = manager512.hashKey(key);

			const isValid = manager512.validateKey(key, hash);
			expect(isValid).toBe(true);
		});
	});

	describe("verify method", () => {
		it("should verify a valid key", async () => {
			const { key } = await keys.create({ ownerId: "user_123" });

			const result = await keys.verify(key);
			expect(result.valid).toBe(true);
			expect(result.record).toBeDefined();
			expect(result.record?.metadata.ownerId).toBe("user_123");
		});

		it("should verify with Bearer token", async () => {
			const { key } = await keys.create({ ownerId: "user_123" });

			const result = await keys.verify(`Bearer ${key}`);
			expect(result.valid).toBe(true);
		});

		it("should reject invalid key", async () => {
			const result = await keys.verify("sk_test_invalid123");
			expect(result.valid).toBe(false);
			expect(result.error).toBeDefined();
		});

		it("should reject expired key", async () => {
			const pastDate = new Date();
			pastDate.setFullYear(pastDate.getFullYear() - 1);

			const { key } = await keys.create({
				ownerId: "user_123",
				expiresAt: pastDate.toISOString(),
			});

			const result = await keys.verify(key);
			expect(result.valid).toBe(false);
			expect(result.error).toContain("expired");
		});
	});

	describe("creating keys", () => {
		it("should create a key with metadata", async () => {
			const { key, record } = await keys.create({
				ownerId: "user_123",
				name: "Test Key",
				description: "A test API key",
			});

			expect(key).toMatch(SK_TEST_PREFIX_REGEX);
			expect(record.id).toBeDefined();
			expect(record.keyHash).toBeDefined();
			expect(record.metadata.ownerId).toBe("user_123");
			expect(record.metadata.name).toBe("Test Key");
			expect(record.metadata.description).toBe("A test API key");
		});

		it("should create a key with scopes", async () => {
			const { record } = await keys.create({
				ownerId: "user_123",
				scopes: ["read", "write"],
			});

			expect(record.metadata.scopes).toEqual(["read", "write"]);
		});

		it("should create a key with expiration", async () => {
			const expiresAt = new Date("2025-12-31");

			const { record } = await keys.create({
				ownerId: "user_expires",
				expiresAt: expiresAt.toISOString(),
			});

			expect(record.metadata.expiresAt).toBe(expiresAt.toISOString());
		});

		it("should automatically set createdAt timestamp", async () => {
			const { record } = await keys.create({
				ownerId: "user_123",
			});

			expect(record.metadata.createdAt).toBeDefined();
			expect(record.metadata.createdAt).toMatch(ISO_DATE_REGEX);
		});
	});

	describe("listing keys", () => {
		it("should list all keys for an owner", async () => {
			await keys.create({ ownerId: "user_123" });
			await keys.create({ ownerId: "user_123" });

			const keyList = await keys.list("user_123");
			expect(keyList.length).toBe(2);
		});

		it("should return empty array for non-existent owner", async () => {
			const keyList = await keys.list("non_existent");
			expect(keyList).toEqual([]);
		});
	});

	describe("revoking keys", () => {
		it("should revoke a key by ID", async () => {
			const { record } = await keys.create({
				ownerId: "user_123",
			});

			await keys.revoke(record.id);

			const found = await keys.findById(record.id);
			expect(found).not.toBeNull();
			expect(found?.metadata.revokedAt).toBeDefined();
		});

		it("should revoke all keys for an owner", async () => {
			const { key: key1 } = await keys.create({ ownerId: "user_123" });
			const { key: key2 } = await keys.create({ ownerId: "user_123" });

			await keys.revokeAll("user_123");

			const keyList = await keys.list("user_123");
			expect(keyList.length).toBe(2);
			expect(keyList[0]?.metadata.revokedAt).toBeDefined();
			expect(keyList[1]?.metadata.revokedAt).toBeDefined();

			const result1 = await keys.verify(key1);
			const result2 = await keys.verify(key2);
			expect(result1.valid).toBe(false);
			expect(result2.valid).toBe(false);
		});
	});

	describe("end-to-end workflow", () => {
		it("should create, verify, and revoke a key", async () => {
			// Create
			const { key, record } = await keys.create({
				ownerId: "user_123",
				name: "Production Key",
			});
			expect(key.startsWith("sk_test_")).toBe(true);

			// Verify
			const result = await keys.verify(key);
			expect(result.valid).toBe(true);
			expect(result.record?.id).toBe(record.id);

			// Revoke
			await keys.revoke(record.id);
			const afterRevoke = await keys.findById(record.id);
			expect(afterRevoke).not.toBeNull();
			expect(afterRevoke?.metadata.revokedAt).toBeDefined();
		});

		it("should handle multiple keys for the same owner", async () => {
			const { key: key1, record: record1 } = await keys.create({
				ownerId: "user_123",
			});
			const { key: key2, record: record2 } = await keys.create({
				ownerId: "user_123",
			});

			expect(record1.id).not.toBe(record2.id);

			const ownerKeys = await keys.list("user_123");
			expect(ownerKeys.length).toBe(2);

			const result1 = await keys.verify(key1);
			const result2 = await keys.verify(key2);

			expect(result1.valid).toBe(true);
			expect(result2.valid).toBe(true);
		});
	});
});

describe("ApiKeyManager - Key Extraction", () => {
	let keys: ReturnType<typeof createKeys>;

	beforeEach(() => {
		keys = createKeys({ prefix: "sk_" });
	});

	it("should extract key from Headers object", async () => {
		const { key } = await keys.create({ ownerId: "user_1" });

		const headers = new Headers({
			authorization: `Bearer ${key}`,
		});

		const result = await keys.verify(headers);
		expect(result.valid).toBe(true);
	});

	it("should extract key from x-api-key header", async () => {
		const { key } = await keys.create({ ownerId: "user_1" });

		const headers = new Headers({
			"x-api-key": key,
		});

		const result = await keys.verify(headers);
		expect(result.valid).toBe(true);
	});

	it("should extract key from plain object", async () => {
		const { key } = await keys.create({ ownerId: "user_1" });

		const headers = {
			authorization: `Bearer ${key}`,
		};

		const result = await keys.verify(headers);
		expect(result.valid).toBe(true);
	});

	it("should support custom header names per request", async () => {
		const { key } = await keys.create({ ownerId: "user_1" });

		const headers = new Headers({
			"x-custom-auth": key,
		});

		const result = await keys.verify(headers, {
			headerNames: ["x-custom-auth"],
		});

		expect(result.valid).toBe(true);
	});

	it("should provide extractKey helper", () => {
		const headers = new Headers({
			"x-api-key": "sk_test_123",
		});

		const key = keys.extractKey(headers);
		expect(key).toBe("sk_test_123");
	});

	it("should provide hasKey helper", () => {
		const headers1 = new Headers({
			"x-api-key": "sk_test_123",
		});

		const headers2 = new Headers({
			"content-type": "application/json",
		});

		expect(keys.hasKey(headers1)).toBe(true);
		expect(keys.hasKey(headers2)).toBe(false);
	});
});

describe("ApiKeyManager - Config-based Header Extraction", () => {
	it("should use default header names from config", async () => {
		const keys = createKeys({ prefix: "sk_" });
		const { key } = await keys.create({ ownerId: "user_1" });

		const headers = new Headers({
			authorization: `Bearer ${key}`,
		});

		const result = await keys.verify(headers);
		expect(result.valid).toBe(true);
	});

	it("should use custom header names from config", async () => {
		const keys = createKeys({
			prefix: "sk_",
			headerNames: ["x-custom-auth", "x-api-token"],
		});
		const { key } = await keys.create({ ownerId: "user_1" });

		const headers = new Headers({
			"x-custom-auth": key,
		});

		const result = await keys.verify(headers);
		expect(result.valid).toBe(true);
	});

	it("should respect extractBearer config option", async () => {
		const keys = createKeys({
			prefix: "sk_",
			extractBearer: false,
		});
		const { key } = await keys.create({ ownerId: "user_1" });

		const headers = new Headers({
			authorization: key,
		});

		const result = await keys.verify(headers);
		expect(result.valid).toBe(true);
	});

	it("should allow overriding header names per request", async () => {
		const keys = createKeys({
			prefix: "sk_",
			headerNames: ["authorization"],
		});
		const { key } = await keys.create({ ownerId: "user_1" });

		const headers = new Headers({
			"x-special-key": key,
		});

		const result = await keys.verify(headers, {
			headerNames: ["x-special-key"],
		});

		expect(result.valid).toBe(true);
	});

	it("should use config headers with hasKey helper", () => {
		const keys = createKeys({
			prefix: "sk_",
			headerNames: ["x-api-key"],
		});

		const headers1 = new Headers({
			"x-api-key": "sk_test_123",
		});

		const headers2 = new Headers({
			authorization: "Bearer sk_test_123",
		});

		expect(keys.hasKey(headers1)).toBe(true);
		expect(keys.hasKey(headers2)).toBe(false);
	});

	it("should use config headers with extractKey helper", () => {
		const keys = createKeys({
			prefix: "sk_",
			headerNames: ["x-custom-token"],
		});

		const headers = new Headers({
			"x-custom-token": "sk_test_123",
		});

		const extracted = keys.extractKey(headers);
		expect(extracted).toBe("sk_test_123");
	});

	it("should work with multiple configured header names", async () => {
		const keys = createKeys({
			prefix: "sk_",
			headerNames: ["x-api-key", "x-api-token", "authorization"],
		});
		const { key } = await keys.create({ ownerId: "user_1" });

		const headers1 = new Headers({ "x-api-key": key });
		const headers2 = new Headers({ "x-api-token": key });
		const headers3 = new Headers({ authorization: `Bearer ${key}` });

		const result1 = await keys.verify(headers1);
		const result2 = await keys.verify(headers2);
		const result3 = await keys.verify(headers3);

		expect(result1.valid).toBe(true);
		expect(result2.valid).toBe(true);
		expect(result3.valid).toBe(true);
	});

	it("should prefer first configured header when multiple present", async () => {
		const keys = createKeys({
			prefix: "sk_",
			headerNames: ["x-primary-key", "x-secondary-key"],
		});
		const { key: key1 } = await keys.create({ ownerId: "user_1" });
		const { key: key2 } = await keys.create({ ownerId: "user_2" });

		const headers = new Headers({
			"x-primary-key": key1,
			"x-secondary-key": key2,
		});

		const result = await keys.verify(headers);
		expect(result.valid).toBe(true);
		expect(result.record?.metadata.ownerId).toBe("user_1");
	});
});

describe("ApiKeyManager - Caching", () => {
	describe("without cache", () => {
		it("should work normally without caching", async () => {
			const keys = createKeys({ prefix: "sk_" });
			const { key } = await keys.create({ ownerId: "user_1" });

			const result1 = await keys.verify(key);
			const result2 = await keys.verify(key);

			expect(result1.valid).toBe(true);
			expect(result2.valid).toBe(true);
		});
	});

	describe("with in-memory cache (cache: true)", () => {
		it("should enable memory cache by default", async () => {
			const keys = createKeys({ prefix: "sk_", cache: true });
			const { key } = await keys.create({ ownerId: "user_1" });

			const result1 = await keys.verify(key);
			const result2 = await keys.verify(key);

			expect(result1.valid).toBe(true);
			expect(result2.valid).toBe(true);
		});

		it("should cache valid keys", async () => {
			const storage = new MemoryStore();
			const keys = createKeys({
				prefix: "sk_",
				cache: true,
				storage,
			});

			const { key } = await keys.create({ ownerId: "user_1" });

			const spyFindByHash = vi.spyOn(storage, "findByHash");

			await keys.verify(key);
			await keys.verify(key);
			await keys.verify(key);

			expect(spyFindByHash).toHaveBeenCalledTimes(1);
		});

		it("should not cache invalid keys", async () => {
			const keys = createKeys({ prefix: "sk_", cache: true });

			const result1 = await keys.verify("sk_invalid_123");
			const result2 = await keys.verify("sk_invalid_123");

			expect(result1.valid).toBe(false);
			expect(result2.valid).toBe(false);
		});

		it("should invalidate cache on revoke", async () => {
			const storage = new MemoryStore();
			const keys = createKeys({
				prefix: "sk_",
				cache: true,
				storage,
			});

			const { key, record } = await keys.create({ ownerId: "user_1" });

			const result1 = await keys.verify(key);
			expect(result1.valid).toBe(true);

			await keys.revoke(record.id);

			const result2 = await keys.verify(key);
			expect(result2.valid).toBe(false);
		});

		it("should skip cache when skipCache option is true", async () => {
			const storage = new MemoryStore();
			const keys = createKeys({
				prefix: "sk_",
				cache: true,
				storage,
			});

			const { key } = await keys.create({ ownerId: "user_1" });

			const spyFindByHash = vi.spyOn(storage, "findByHash");

			await keys.verify(key);
			await keys.verify(key, { skipCache: true });

			expect(spyFindByHash).toHaveBeenCalledTimes(2);
		});

		it("should not cache expired keys", async () => {
			const keys = createKeys({ prefix: "sk_", cache: true });

			const pastDate = new Date();
			pastDate.setFullYear(pastDate.getFullYear() - 1);

			const { key } = await keys.create({
				ownerId: "user_1",
				expiresAt: pastDate.toISOString(),
			});

			const result1 = await keys.verify(key);
			const result2 = await keys.verify(key);

			expect(result1.valid).toBe(false);
			expect(result2.valid).toBe(false);
		});

		it("should invalidate cache for all user keys on revokeAll", async () => {
			const storage = new MemoryStore();
			const keys = createKeys({
				prefix: "sk_",
				cache: true,
				storage,
			});

			const { key: key1 } = await keys.create({ ownerId: "user_1" });
			const { key: key2 } = await keys.create({ ownerId: "user_1" });

			await keys.verify(key1);
			await keys.verify(key2);

			await keys.revokeAll("user_1");

			const result1 = await keys.verify(key1);
			const result2 = await keys.verify(key2);

			expect(result1.valid).toBe(false);
			expect(result2.valid).toBe(false);
		});
	});

	describe("with custom cache", () => {
		it("should use custom cache implementation", async () => {
			const customCache = new MemoryCache();
			const keys = createKeys({
				prefix: "sk_",
				cache: customCache,
			});

			const { key } = await keys.create({ ownerId: "user_1" });

			const result = await keys.verify(key);
			expect(result.valid).toBe(true);

			const cacheKey = `apikey:${keys.hashKey(key)}`;
			const cached = customCache.get(cacheKey);
			expect(cached).toBeTruthy();
		});

		it("should allow manual cache invalidation", async () => {
			const keys = createKeys({ prefix: "sk_", cache: true });
			const { key, record } = await keys.create({ ownerId: "user_1" });

			await keys.verify(key);
			await keys.invalidateCache(record.keyHash);

			const result = await keys.verify(key);
			expect(result.valid).toBe(true);
		});
	});
});

describe("ApiKeyManager - Additional Operations", () => {
	let keys: ReturnType<typeof createKeys>;
	let storage: MemoryStore;

	beforeEach(() => {
		storage = new MemoryStore();
		keys = createKeys({
			prefix: "sk_test_",
			length: 32,
			algorithm: "sha256",
			storage,
		});
	});

	describe("enable/disable operations", () => {
		it("should enable a disabled key", async () => {
			const { key, record } = await keys.create({ ownerId: "user_1" });

			await keys.disable(record.id);
			const disabledResult = await keys.verify(key);
			expect(disabledResult.valid).toBe(false);
			expect(disabledResult.error).toBe("API key is disabled");

			await keys.enable(record.id);
			const enabledResult = await keys.verify(key);
			expect(enabledResult.valid).toBe(true);
		});

		it("should disable an enabled key", async () => {
			const { key, record } = await keys.create({ ownerId: "user_1" });

			await keys.disable(record.id);
			const result = await keys.verify(key);
			expect(result.valid).toBe(false);
			expect(result.error).toBe("API key is disabled");
		});

		it("should throw error when enabling non-existent key", async () => {
			await expect(keys.enable("non-existent")).rejects.toThrow(
				"API key not found"
			);
		});

		it("should throw error when disabling non-existent key", async () => {
			await expect(keys.disable("non-existent")).rejects.toThrow(
				"API key not found"
			);
		});
	});

	describe("rotate operations", () => {
		it("should rotate a key successfully", async () => {
			const { key: oldKey, record: oldRecord } = await keys.create({
				ownerId: "user_1",
				name: "Old Key",
				scopes: ["read"],
			});

			const {
				key: newKey,
				record: newRecord,
				oldRecord: rotatedOldRecord,
			} = await keys.rotate(oldRecord.id, {
				name: "New Key",
				scopes: ["read", "write"],
			});

			expect(newKey).toBeDefined();
			expect(newKey).not.toBe(oldKey);
			expect(newRecord.metadata.name).toBe("New Key");
			expect(newRecord.metadata.scopes).toEqual(["read", "write"]);
			expect(rotatedOldRecord.id).toBe(oldRecord.id);

			// Old key should be revoked
			const oldResult = await keys.verify(oldKey);
			expect(oldResult.valid).toBe(false);
			expect(oldResult.error).toBe("API key has been revoked");

			// New key should work
			const newResult = await keys.verify(newKey);
			expect(newResult.valid).toBe(true);
		});

		it("should throw error when rotating non-existent key", async () => {
			await expect(keys.rotate("non-existent")).rejects.toThrow(
				"API key not found"
			);
		});
	});

	describe("revokeAll operations", () => {
		it("should revoke all keys for an owner", async () => {
			const { key: key1 } = await keys.create({ ownerId: "user_1" });
			const { key: key2 } = await keys.create({ ownerId: "user_1" });
			const { key: key3 } = await keys.create({ ownerId: "user_2" });

			await keys.revokeAll("user_1");

			const result1 = await keys.verify(key1);
			const result2 = await keys.verify(key2);
			const result3 = await keys.verify(key3);

			expect(result1.valid).toBe(false);
			expect(result2.valid).toBe(false);
			expect(result3.valid).toBe(true); // user_2 keys should still work
		});
	});

	describe("verifyFromHeaders", () => {
		it("should return record when valid", async () => {
			const { key } = await keys.create({ ownerId: "user_1" });
			const headers = new Headers({ "x-api-key": key });

			const record = await keys.verifyFromHeaders(headers);
			expect(record).toBeDefined();
			expect(record?.metadata.ownerId).toBe("user_1");
		});

		it("should return null when invalid", async () => {
			const headers = new Headers({ "x-api-key": "invalid-key" });

			const record = await keys.verifyFromHeaders(headers);
			expect(record).toBeNull();
		});
	});

	describe("scope helpers", () => {
		it("should check hasAnyScope", async () => {
			const { record } = await keys.create({
				ownerId: "user_1",
				scopes: ["read", "write"],
			});

			expect(keys.hasAnyScope(record, ["read"])).toBe(true);
			expect(keys.hasAnyScope(record, ["admin"])).toBe(false);
			expect(keys.hasAnyScope(record, ["read", "admin"])).toBe(true);
		});

		it("should check hasAllScopes", async () => {
			const { record } = await keys.create({
				ownerId: "user_1",
				scopes: ["read", "write"],
			});

			expect(keys.hasAllScopes(record, ["read"])).toBe(true);
			expect(keys.hasAllScopes(record, ["read", "write"])).toBe(true);
			expect(keys.hasAllScopes(record, ["read", "admin"])).toBe(false);
		});
	});

	describe("resource scope checks", () => {
		it("should check resource scope", async () => {
			const { record } = await keys.create({
				ownerId: "user_1",
				scopes: ["read", "write"],
				resources: { website: ["site1", "site2"] },
			});

			expect(keys.checkResourceScope(record, "website", "site1", "read")).toBe(
				true
			);
			// site3 is not in resources, so it falls back to global scopes (read is present)
			expect(keys.checkResourceScope(record, "website", "site3", "read")).toBe(
				true
			);
			expect(keys.checkResourceScope(null, "website", "site1", "read")).toBe(
				false
			);
		});

		it("should check resource any scope", async () => {
			const { record } = await keys.create({
				ownerId: "user_1",
				scopes: ["read", "write"],
				resources: { website: ["site1"] },
			});

			expect(
				keys.checkResourceAnyScope(record, "website", "site1", [
					"read",
					"admin",
				])
			).toBe(true);
			// site2 is not in resources, so it falls back to global scopes (read is present)
			expect(
				keys.checkResourceAnyScope(record, "website", "site2", ["read"])
			).toBe(true);
			expect(
				keys.checkResourceAnyScope(null, "website", "site1", ["read"])
			).toBe(false);
		});

		it("should check resource all scopes", async () => {
			const { record } = await keys.create({
				ownerId: "user_1",
				scopes: ["read", "write"],
				resources: { website: ["site1"] },
			});

			expect(
				keys.checkResourceAllScopes(record, "website", "site1", [
					"read",
					"write",
				])
			).toBe(true);
			expect(
				keys.checkResourceAllScopes(record, "website", "site1", [
					"read",
					"admin",
				])
			).toBe(false);
			expect(
				keys.checkResourceAllScopes(null, "website", "site1", ["read"])
			).toBe(false);
		});
	});

	describe("findByHash", () => {
		it("should find record by hash", async () => {
			const { key, record } = await keys.create({ ownerId: "user_1" });
			const keyHash = keys.hashKey(key);

			const found = await keys.findByHash(keyHash);
			expect(found).toBeDefined();
			expect(found?.id).toBe(record.id);
		});
	});

	describe("error handling", () => {
		it("should handle updateLastUsed errors gracefully", async () => {
			// Create a mock storage that throws on updateMetadata
			const errorStorage = new MemoryStore();

			errorStorage.updateMetadata = () => {
				throw new Error("Database error");
			};

			const keysWithErrorStorage = createKeys({
				prefix: "sk_",
				storage: errorStorage,
				autoTrackUsage: true,
			});

			const { key } = await keysWithErrorStorage.create({ ownerId: "user_1" });

			// This should not throw, errors should be caught
			const result = await keysWithErrorStorage.verify(key);
			expect(result.valid).toBe(true);
		});

		it("should handle cache deletion errors in invalidateCache", async () => {
			const errorCache = new MemoryCache();

			errorCache.del = () => {
				throw new Error("Cache error");
			};

			const keysWithErrorCache = createKeys({
				prefix: "sk_",
				cache: errorCache,
			});

			const { record } = await keysWithErrorCache.create({ ownerId: "user_1" });

			await expect(
				keysWithErrorCache.invalidateCache(record.keyHash)
			).rejects.toThrow("Cache error");
		});
	});

	describe("missing key validation", () => {
		it("should return error when API key is missing", async () => {
			const result = await keys.verify("");
			expect(result.valid).toBe(false);
			expect(result.error).toBe("Missing API key");
		});

		it("should return error when API key is undefined", async () => {
			const result = await keys.verify(undefined as unknown as string);
			expect(result.valid).toBe(false);
			expect(result.error).toBe("Missing API key");
		});
	});

	describe("cache error handling", () => {
		it("should handle cache write errors during verify", async () => {
			const errorCache = new MemoryCache();
			errorCache.set = vi
				.fn()
				.mockRejectedValue(new Error("Cache write failed"));

			const keysWithErrorCache = createKeys({
				prefix: "sk_",
				cache: errorCache,
			});

			const { key } = await keysWithErrorCache.create({ ownerId: "user_1" });
			const result = await keysWithErrorCache.verify(key);

			expect(result.valid).toBe(true);
		});

		it("should handle cache corruption gracefully", async () => {
			const cache = new MemoryCache();
			const keysWithCache = createKeys({
				prefix: "sk_",
				cache,
			});

			const { key } = await keysWithCache.create({ ownerId: "user_1" });
			const keyHash = keysWithCache.hashKey(key);

			// Simulate cache corruption with invalid JSON
			await cache.set(`apikey:${keyHash}`, "invalid json", 60);

			const result = await keysWithCache.verify(key);
			expect(result.valid).toBe(true);
		});

		it("should handle cache del errors during revoke", async () => {
			const errorCache = new MemoryCache();
			errorCache.del = vi.fn().mockRejectedValue(new Error("Cache del failed"));

			const keysWithErrorCache = createKeys({
				prefix: "sk_",
				cache: errorCache,
			});

			const { key, record } = await keysWithErrorCache.create({
				ownerId: "user_1",
			});
			await keysWithErrorCache.verify(key);

			// Revoke should succeed even if cache fails
			const result = await keysWithErrorCache.revoke(record.id);
			expect(result).toBeUndefined();
		});

		it("should handle cache del errors during enable", async () => {
			const errorCache = new MemoryCache();
			errorCache.del = vi.fn().mockRejectedValue(new Error("Cache del failed"));

			const keysWithErrorCache = createKeys({
				prefix: "sk_",
				cache: errorCache,
			});

			const { record } = await keysWithErrorCache.create({ ownerId: "user_1" });
			await keysWithErrorCache.disable(record.id);

			// Enable should succeed even if cache fails
			await keysWithErrorCache.enable(record.id);
			const result = await keysWithErrorCache.verifyFromHeaders({
				"x-api-key": record.keyHash,
			});
			expect(result).toBeNull(); // Can't verify with hash, but should not throw
		});

		it("should handle cache del errors during disable", async () => {
			const errorCache = new MemoryCache();
			errorCache.del = vi.fn().mockRejectedValue(new Error("Cache del failed"));

			const keysWithErrorCache = createKeys({
				prefix: "sk_",
				cache: errorCache,
			});

			const { record } = await keysWithErrorCache.create({ ownerId: "user_1" });

			// Disable should succeed even if cache fails
			await keysWithErrorCache.disable(record.id);
		});

		it("should handle cache del errors during rotate", async () => {
			const errorCache = new MemoryCache();
			errorCache.del = vi.fn().mockRejectedValue(new Error("Cache del failed"));

			const keysWithErrorCache = createKeys({
				prefix: "sk_",
				cache: errorCache,
			});

			const { record } = await keysWithErrorCache.create({ ownerId: "user_1" });

			// Rotate should succeed even if cache fails
			const rotateResult = await keysWithErrorCache.rotate(record.id);
			expect(rotateResult).toBeDefined();
			expect(rotateResult.key).toBeDefined();
		});
	});

	describe("cache cleanup on invalid keys", () => {
		it("should clean up expired keys from cache", async () => {
			const cache = new MemoryCache();
			const keysWithCache = createKeys({
				prefix: "sk_",
				cache,
			});

			const pastDate = new Date();
			pastDate.setFullYear(pastDate.getFullYear() - 1);

			const { key, record } = await keysWithCache.create({
				ownerId: "user_1",
				expiresAt: pastDate.toISOString(),
			});

			const keyHash = keysWithCache.hashKey(key);
			// Put expired record in cache
			await cache.set(`apikey:${keyHash}`, JSON.stringify(record), 60);

			const result = await keysWithCache.verify(key);
			expect(result.valid).toBe(false);

			// Verify cache was cleaned up
			const cached = await cache.get(`apikey:${keyHash}`);
			expect(cached).toBeNull();
		});

		it("should clean up revoked keys from cache", async () => {
			const cache = new MemoryCache();
			const keysWithCache = createKeys({
				prefix: "sk_",
				cache,
			});

			const { key, record } = await keysWithCache.create({ ownerId: "user_1" });
			const keyHash = keysWithCache.hashKey(key);

			// Verify once to populate cache
			await keysWithCache.verify(key);

			// Revoke the key
			await keysWithCache.revoke(record.id);

			// Verify cache was cleaned up
			const cached = await cache.get(`apikey:${keyHash}`);
			expect(cached).toBeNull();
		});

		it("should reject disabled keys from cache", async () => {
			const cache = new MemoryCache();
			const keysWithCache = createKeys({
				prefix: "sk_",
				cache,
			});

			const { key, record } = await keysWithCache.create({ ownerId: "user_1" });
			const keyHash = keysWithCache.hashKey(key);

			// Verify once to populate cache
			await keysWithCache.verify(key);

			// Disable the key
			await keysWithCache.disable(record.id);

			// Verify cache was cleaned up
			const cached = await cache.get(`apikey:${keyHash}`);
			expect(cached).toBeNull();
		});
	});

	describe("rate limiting", () => {
		it("should enforce rate limits on verify calls", async () => {
			const keysWithRateLimit = createKeys({
				prefix: "sk_",
				cache: true,
				rateLimit: {
					maxRequests: 3,
					windowMs: 60_000,
				},
			});

			const { key } = await keysWithRateLimit.create({ ownerId: "user_1" });

			// First 3 requests should succeed
			const ALLOWED_REQUESTS = 3;
			for (let i = 0; i < ALLOWED_REQUESTS; i++) {
				const result = await keysWithRateLimit.verify(key);
				expect(result.valid).toBe(true);
				expect(result.rateLimit).toBeDefined();
				expect(result.rateLimit?.limit).toBe(ALLOWED_REQUESTS);
				expect(result.rateLimit?.remaining).toBe(ALLOWED_REQUESTS - (i + 1));
			}

			// 4th request should be rate limited
			const blockedResult = await keysWithRateLimit.verify(key);
			expect(blockedResult.valid).toBe(false);
			expect(blockedResult.errorCode).toBe("RATE_LIMIT_EXCEEDED");
			expect(blockedResult.error).toBe("Rate limit exceeded");
			expect(blockedResult.rateLimit).toBeDefined();
			// biome-ignore lint/style/noMagicNumbers: 4 is the blocked request count
			expect(blockedResult.rateLimit?.current).toBe(4);
			expect(blockedResult.rateLimit?.remaining).toBe(0);
		});

		it("should not include rate limit info when rate limiting is disabled", async () => {
			const keysWithoutRateLimit = createKeys({
				prefix: "sk_",
				cache: true,
			});

			const { key } = await keysWithoutRateLimit.create({ ownerId: "user_1" });
			const result = await keysWithoutRateLimit.verify(key);

			expect(result.valid).toBe(true);
			expect(result.rateLimit).toBeUndefined();
		});

		it("should throw error when rate limiting is configured without cache", () => {
			expect(() =>
				createKeys({
					prefix: "sk_",
					rateLimit: {
						maxRequests: 100,
						windowMs: 60_000,
					},
				})
			).toThrow("Cache is required for rate limiting");
		});

		it("should rate limit per API key", async () => {
			const keysWithRateLimit = createKeys({
				prefix: "sk_",
				cache: true,
				rateLimit: {
					maxRequests: 2,
					windowMs: 60_000,
				},
			});

			const { key: key1 } = await keysWithRateLimit.create({
				ownerId: "user_1",
			});
			const { key: key2 } = await keysWithRateLimit.create({
				ownerId: "user_2",
			});

			// Use key1 twice (hit limit)
			await keysWithRateLimit.verify(key1);
			await keysWithRateLimit.verify(key1);

			// Third request for key1 should be blocked
			const key1Result = await keysWithRateLimit.verify(key1);
			expect(key1Result.valid).toBe(false);
			expect(key1Result.errorCode).toBe("RATE_LIMIT_EXCEEDED");

			// key2 should still work (separate rate limit)
			const key2Result = await keysWithRateLimit.verify(key2);
			expect(key2Result.valid).toBe(true);
			expect(key2Result.rateLimit?.remaining).toBe(1);
		});

		it("should include rate limit info in successful responses", async () => {
			const keysWithRateLimit = createKeys({
				prefix: "sk_",
				cache: true,
				rateLimit: {
					maxRequests: 10,
					windowMs: 60_000,
				},
			});

			const { key } = await keysWithRateLimit.create({ ownerId: "user_1" });
			const result = await keysWithRateLimit.verify(key);

			expect(result.valid).toBe(true);
			expect(result.rateLimit).toBeDefined();
			expect(result.rateLimit?.current).toBe(1);
			expect(result.rateLimit?.limit).toBe(10);
			// biome-ignore lint/style/noMagicNumbers: 9 is the remaining requests
			expect(result.rateLimit?.remaining).toBe(9);
			expect(result.rateLimit?.resetMs).toBeGreaterThan(0);
			expect(result.rateLimit?.resetAt).toMatch(ISO_DATE_REGEX);
		});

		it("should rate limit from cache path", async () => {
			const keysWithRateLimit = createKeys({
				prefix: "sk_",
				cache: true,
				rateLimit: {
					maxRequests: 2,
					windowMs: 60_000,
				},
			});

			const { key } = await keysWithRateLimit.create({ ownerId: "user_1" });

			// First verify (cache miss)
			const result1 = await keysWithRateLimit.verify(key);
			expect(result1.valid).toBe(true);

			// Second verify (cache hit)
			const result2 = await keysWithRateLimit.verify(key);
			expect(result2.valid).toBe(true);

			// Third verify should be rate limited (cache hit)
			const result3 = await keysWithRateLimit.verify(key);
			expect(result3.valid).toBe(false);
			expect(result3.errorCode).toBe("RATE_LIMIT_EXCEEDED");
		});
	});
});
