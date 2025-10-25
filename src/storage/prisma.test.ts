import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createKeys } from "../manager";
import type { ApiKeyRecord } from "../types/api-key-types";
import { ApiKeyErrorCode } from "../types/error-types";
import { PrismaStore } from "./prisma";

const REGEX_UPDATED_NAME = /Updated \d/;
const MANY_SCOPES_COUNT = 25;
const LARGE_RESOURCES_COUNT = 50;
const LONG_DESCRIPTION_LENGTH = 10_000;
const CONCURRENT_OPS_COUNT = 10;
const CONCURRENT_UPDATES_COUNT = 5;
const STRESS_SAVES_COUNT = 1000;
const STRESS_TIMEOUT_MS = 5000;
const MIXED_OPS_COUNT = 500;
const MIXED_UPDATES_COUNT = 100;
const MIXED_DELETES_COUNT = 50;
const OWNER_TEST_COUNT = 100;
const OWNERS_COUNT = 10;
const TAG_CASE_INSENSITIVE_COUNT = 1;
const ARRAY_OFFSET = 1;

describe("PrismaStore", () => {
	let prisma: PrismaClient;
	let store: PrismaStore;
	let keys: ReturnType<typeof createKeys>;

	beforeAll(async () => {
		const DATABASE_URL =
			process.env.DATABASE_URL ||
			"postgresql://keypal:keypal_dev@localhost:5432/keypal";

		try {
			prisma = new PrismaClient({
				datasources: {
					db: {
						url: DATABASE_URL,
					},
				},
			});

			await prisma.$connect();
		} catch (error) {
			console.warn(
				"PostgreSQL not available. Skipping Prisma tests. Start with: docker-compose up postgres"
			);
			throw error;
		}

		store = new PrismaStore({ prisma, model: "apiKey" });

		keys = createKeys({
			prefix: "sk_test_",
			length: 32,
			algorithm: "sha256",
			storage: store,
		});
	});

	afterEach(async () => {
		if (prisma) {
			await prisma.apiKey.deleteMany();
		}
	});

	afterAll(async () => {
		if (prisma) {
			try {
				await prisma.apiKey.deleteMany();
				await prisma.$disconnect();
			} catch {
				// Ignore cleanup errors
			}
		}
	});

	describe("save", () => {
		it("should save a record with metadata", async () => {
			const { key, record } = await keys.create({
				ownerId: "user_123",
				name: "Test Key",
				scopes: ["read", "write"],
			});

			const result = await store.findById(record.id);
			expect(result).not.toBeNull();
			expect(result?.id).toBe(record.id);
			expect(result?.keyHash).toBe(record.keyHash);
			expect(result?.metadata.name).toBe("Test Key");
			expect(result?.metadata.scopes).toEqual(["read", "write"]);

			// Verify we can verify the key
			const verifyResult = await keys.verify(key);
			expect(verifyResult.valid).toBe(true);
		});

		it("should preserve all metadata fields", async () => {
			const oneDay = 86_400_000;
			const metadata = {
				ownerId: "user_all_fields",
				name: "Complete Key",
				description: "A key with all fields",
				scopes: ["read", "write", "admin"],
				resources: {
					"project:123": ["read"],
					"project:456": ["write", "delete"],
				},
				enabled: true,
				expiresAt: new Date(Date.now() + oneDay).toISOString(),
				createdAt: new Date().toISOString(),
			};

			const { record } = await keys.create(metadata);

			const result = await store.findById(record.id);
			expect(result).not.toBeNull();
			expect(result?.metadata.name).toBe(metadata.name);
			expect(result?.metadata.description).toBe(metadata.description);
			expect(result?.metadata.scopes).toEqual(metadata.scopes);
			expect(result?.metadata.resources).toEqual(metadata.resources);
			expect(result?.metadata.enabled).toBe(metadata.enabled);
			expect(result?.metadata.expiresAt).toBe(metadata.expiresAt);
			expect(result?.metadata.createdAt).toBe(metadata.createdAt);
		});

		it("should prevent duplicate IDs", async () => {
			const { record: record1 } = await keys.create({
				ownerId: "user_overwrite",
				name: "Original",
			});

			const record2: ApiKeyRecord = {
				id: record1.id,
				keyHash: keys.hashKey(keys.generateKey()),
				metadata: {
					ownerId: "user_different",
					name: "Overwritten",
				},
			};

			await expect(store.save(record2)).rejects.toThrow();

			const found = await store.findById(record1.id);
			expect(found?.metadata.name).toBe("Original");
			expect(found?.metadata.ownerId).toBe("user_overwrite");
		});

		it("should handle concurrent saves to different records", async () => {
			const promises = Array.from({ length: CONCURRENT_OPS_COUNT }, (_, i) =>
				keys.create({
					ownerId: `user_concurrent_${i}`,
					name: `Concurrent Key ${i}`,
				})
			);

			const results = await Promise.all(promises);

			for (const { record } of results) {
				const found = await store.findById(record.id);
				expect(found).not.toBeNull();
			}
		});
	});

	describe("findByHash", () => {
		it("should find a record by hash", async () => {
			const { record } = await keys.create({
				ownerId: "user_456",
				name: "Found Key",
			});

			const result = await store.findByHash(record.keyHash);
			expect(result).not.toBeNull();
			expect(result?.keyHash).toBe(record.keyHash);
			expect(result?.metadata.ownerId).toBe("user_456");
			expect(result?.metadata.name).toBe("Found Key");
		});

		it("should return null for non-existent hash", async () => {
			const result = await store.findByHash("nonexistent_hash");
			expect(result).toBeNull();
		});

		it("should return exact hash match only", async () => {
			const { record } = await keys.create({
				ownerId: "user_exact",
			});

			const similarHash = `${record.keyHash.slice(0, -1)}X`;
			const result = await store.findByHash(similarHash);
			expect(result).toBeNull();
		});

		it("should work during concurrent saves", async () => {
			const { record } = await keys.create({
				ownerId: "user_concurrent_find",
			});

			const promises = [
				...Array.from({ length: 5 }, () => store.findByHash(record.keyHash)),
				...Array.from({ length: 5 }, (_, i) =>
					keys.create({ ownerId: `user_other_${i}` })
				),
			];

			const results = await Promise.all(promises);
			const foundRecords = results.filter(
				(r) => r && "keyHash" in r && r.keyHash === record.keyHash
			);

			expect(foundRecords.length).toBeGreaterThan(0);
		});
	});

	describe("findById", () => {
		it("should find a record by id", async () => {
			const { record } = await keys.create({
				ownerId: "user_789",
				name: "By ID Key",
			});

			const result = await store.findById(record.id);
			expect(result).not.toBeNull();
			expect(result?.id).toBe(record.id);
			expect(result?.metadata.name).toBe("By ID Key");
		});

		it("should return null for non-existent ID", async () => {
			const result = await store.findById("non_existent_id");
			expect(result).toBeNull();
		});

		it("should use primary key lookup", async () => {
			const { record } = await keys.create({
				ownerId: "user_pk",
			});

			const start = performance.now();
			await store.findById(record.id);
			const duration = performance.now() - start;
			const maxDuration = 100;

			expect(duration).toBeLessThan(maxDuration);
		});
	});

	describe("findByOwner", () => {
		it("should find all records for an owner", async () => {
			const ownerId = "user_123";

			await keys.create({
				ownerId,
				scopes: ["read"],
			});

			await keys.create({
				ownerId,
				scopes: ["write"],
			});

			await keys.create({
				ownerId: "user_456",
				scopes: ["admin"],
			});

			const results = await store.findByOwner(ownerId);
			expect(results).toHaveLength(2);
			expect(results.some((r) => r.metadata.scopes?.includes("read"))).toBe(
				true
			);
			expect(results.some((r) => r.metadata.scopes?.includes("write"))).toBe(
				true
			);
		});

		it("should return empty array for non-existent owner", async () => {
			const results = await store.findByOwner("non_existent_owner");
			expect(results).toEqual([]);
		});

		it("should not return keys from other owners", async () => {
			await keys.create({ ownerId: "user_a" });
			await keys.create({ ownerId: "user_b" });
			await keys.create({ ownerId: "user_c" });

			const results = await store.findByOwner("user_b");
			expect(results).toHaveLength(1);
			expect(results[0]?.metadata.ownerId).toBe("user_b");
		});

		it("should handle many keys per owner", async () => {
			const ownerId = "user_many_keys";

			const promises = Array.from({ length: OWNER_TEST_COUNT }, (_, i) =>
				keys.create({
					ownerId,
					name: `Key ${i}`,
				})
			);

			await Promise.all(promises);

			const results = await store.findByOwner(ownerId);
			expect(results).toHaveLength(OWNER_TEST_COUNT);
		});
	});

	describe("findByTag", () => {
		it("should find all records by one tag", async () => {
			const { record } = await keys.create({
				ownerId: "user_123",
				tags: ["test", "key", "more", "tags"],
			});

			const found = await store.findByTag("test");
			expect(found).toHaveLength(1);
			expect(found[0]?.id).toBe(record.id);
		});

		it("should find all records by multiple tags (OR logic)", async () => {
			const { record: r1 } = await keys.create({
				ownerId: "user_123",
				tags: ["test", "key"],
			});

			const { record: r2 } = await keys.create({
				ownerId: "user_123",
				tags: ["test"],
			});

			const expectedCount = 2;
			const found = await store.findByTags(["test", "key"]);
			expect(found).toHaveLength(expectedCount);
			expect(found.some((r) => r.id === r1.id)).toBe(true);
			expect(found.some((r) => r.id === r2.id)).toBe(true);
		});

		it("should find all records by owner and tag", async () => {
			const { record } = await keys.create({
				ownerId: "user_123",
				tags: ["test"],
			});

			await keys.create({
				ownerId: "user_456",
				tags: ["test"],
			});

			const found = await store.findByTag("test", "user_123");
			expect(found).toHaveLength(1);
			expect(found[0]?.id).toBe(record.id);
		});

		it("should handle tags case-insensitively", async () => {
			const { record } = await keys.create({
				ownerId: "user_case",
				tags: ["Production", "API"],
			});

			const foundLower = await store.findByTag("production");
			const foundUpper = await store.findByTag("API");
			const foundMixed = await store.findByTag("api");

			expect(foundLower).toHaveLength(TAG_CASE_INSENSITIVE_COUNT);
			expect(foundUpper).toHaveLength(TAG_CASE_INSENSITIVE_COUNT);
			expect(foundMixed).toHaveLength(TAG_CASE_INSENSITIVE_COUNT);
			expect(foundLower[0]?.id).toBe(record.id);
		});

		it("should return empty array for empty tags", async () => {
			await keys.create({
				ownerId: "user_empty",
				tags: ["test"],
			});

			const found = await store.findByTags([]);
			expect(found).toEqual([]);
		});

		it("should handle records with no tags", async () => {
			await keys.create({
				ownerId: "user_no_tags",
			});

			const found = await store.findByTag("nonexistent");
			expect(found).toEqual([]);
		});
	});

	describe("updateMetadata", () => {
		it("should update metadata for a record", async () => {
			const { record } = await keys.create({
				ownerId: "user_update",
				name: "Original Name",
				scopes: ["read"],
			});

			await store.updateMetadata(record.id, {
				name: "Updated Name",
				scopes: ["admin", "write"],
			});

			const updated = await store.findById(record.id);
			expect(updated?.metadata.name).toBe("Updated Name");
			expect(updated?.metadata.scopes).toEqual(["admin", "write"]);
		});

		it("should merge updates with existing metadata", async () => {
			const { record } = await keys.create({
				ownerId: "user_merge",
				name: "Original Name",
				scopes: ["read"],
			});

			await store.updateMetadata(record.id, {
				description: "New description",
			});

			const updated = await store.findById(record.id);
			expect(updated?.metadata.description).toBe("New description");
			expect(updated?.metadata.name).toBe("Original Name");
			expect(updated?.metadata.scopes).toEqual(["read"]);
		});

		it("should preserve unchanged fields", async () => {
			const { record } = await keys.create({
				ownerId: "user_preserve",
				name: "Preserved Name",
				description: "Preserved Description",
				scopes: ["read", "write"],
				resources: { "project:123": ["read"] },
			});

			await store.updateMetadata(record.id, {
				scopes: ["admin"],
			});

			const updated = await store.findById(record.id);
			expect(updated?.metadata.name).toBe("Preserved Name");
			expect(updated?.metadata.description).toBe("Preserved Description");
			expect(updated?.metadata.resources).toEqual({ "project:123": ["read"] });
			expect(updated?.metadata.scopes).toEqual(["admin"]);
		});

		it("should throw error for non-existent ID", async () => {
			await expect(
				store.updateMetadata("non_existent", { name: "New Name" })
			).rejects.toThrow("API key with id non_existent not found");
		});

		it("should handle concurrent updates to same record", async () => {
			const { record } = await keys.create({
				ownerId: "user_concurrent_update",
			});

			const promises = Array.from(
				{ length: CONCURRENT_UPDATES_COUNT },
				(_, i) =>
					store.updateMetadata(record.id, {
						name: `Updated ${i}`,
					})
			);

			await Promise.all(promises);

			const updated = await store.findById(record.id);
			expect(updated?.metadata.name).toMatch(REGEX_UPDATED_NAME);
		});

		it("should handle concurrent updates to different records", async () => {
			const records = await Promise.all(
				Array.from({ length: CONCURRENT_OPS_COUNT }, (_, i) =>
					keys.create({
						ownerId: `user_${i}`,
						name: "Original",
					})
				)
			);

			const promises = records.map(({ record }, i) =>
				store.updateMetadata(record.id, {
					name: `Updated ${i}`,
				})
			);

			await Promise.all(promises);

			for (const { record } of records) {
				const updated = await store.findById(record.id);
				expect(updated?.metadata.name).toMatch(REGEX_UPDATED_NAME);
			}
		});
	});

	describe("delete", () => {
		it("should delete a record", async () => {
			const { record } = await keys.create({
				ownerId: "user_delete",
				name: "To Delete",
			});

			await store.delete(record.id);

			const found = await store.findById(record.id);
			expect(found).toBeNull();
		});

		it("should remove hash index when deleting", async () => {
			const { record } = await keys.create({
				ownerId: "user_hash_delete",
			});

			await store.delete(record.id);

			const found = await store.findByHash(record.keyHash);
			expect(found).toBeNull();
		});

		it("should be idempotent (multiple deletes don't error)", async () => {
			const { record } = await keys.create({
				ownerId: "user_idempotent",
			});

			await store.delete(record.id);
			await store.delete(record.id);
			await store.delete(record.id);

			const result = await store.findById(record.id);
			expect(result).toBeNull();
		});

		it("should do nothing for non-existent ID", async () => {
			await store.delete("non_existent");
			// Should not throw
		});

		it("should not affect other records", async () => {
			const { record: r1 } = await keys.create({ ownerId: "user_keep" });
			const { record: r2 } = await keys.create({ ownerId: "user_delete" });

			await store.delete(r2.id);

			const found = await store.findById(r1.id);
			expect(found).not.toBeNull();
		});

		it("should handle concurrent deletes", async () => {
			const records = await Promise.all(
				Array.from({ length: CONCURRENT_OPS_COUNT }, (_, i) =>
					keys.create({ ownerId: `user_${i}` })
				)
			);

			const promises = records.map(({ record }) => store.delete(record.id));

			await Promise.all(promises);

			for (const { record } of records) {
				const found = await store.findById(record.id);
				expect(found).toBeNull();
			}
		});
	});

	describe("deleteByOwner", () => {
		it("should delete all records for an owner", async () => {
			await keys.create({ ownerId: "user_delete" });
			await keys.create({ ownerId: "user_delete" });
			await keys.create({ ownerId: "user_keep" });

			await store.deleteByOwner("user_delete");

			const userDeleteKeys = await store.findByOwner("user_delete");
			const userKeepKeys = await store.findByOwner("user_keep");

			expect(userDeleteKeys).toHaveLength(0);
			expect(userKeepKeys).toHaveLength(1);
		});

		it("should be idempotent (multiple calls don't error)", async () => {
			await keys.create({
				ownerId: "user_idempotent_all",
			});

			await store.deleteByOwner("user_idempotent_all");
			await store.deleteByOwner("user_idempotent_all");
			await store.deleteByOwner("user_idempotent_all");

			const found = await store.findByOwner("user_idempotent_all");
			expect(found).toHaveLength(0);
		});

		it("should do nothing for non-existent owner", async () => {
			await store.deleteByOwner("non_existent");
			// Should not throw
		});

		it("should remove all hash indexes for deleted keys", async () => {
			const { record: r1 } = await keys.create({ ownerId: "user_cleanup" });
			const { record: r2 } = await keys.create({ ownerId: "user_cleanup" });

			await store.deleteByOwner("user_cleanup");

			const found1 = await store.findByHash(r1.keyHash);
			const found2 = await store.findByHash(r2.keyHash);

			expect(found1).toBeNull();
			expect(found2).toBeNull();
		});

		it("should handle concurrent deleteByOwner calls", async () => {
			const owners = Array.from(
				{ length: OWNERS_COUNT },
				(_, i) => `user_concurrent_${i}`
			);

			for (const ownerId of owners) {
				await Promise.all([
					keys.create({ ownerId }),
					keys.create({ ownerId }),
					keys.create({ ownerId }),
				]);
			}

			await Promise.all(owners.map((ownerId) => store.deleteByOwner(ownerId)));

			for (const ownerId of owners) {
				const found = await store.findByOwner(ownerId);
				expect(found).toHaveLength(0);
			}
		});
	});

	describe("Edge Cases", () => {
		it("should handle empty tags array", async () => {
			const { record } = await keys.create({
				ownerId: "user_empty_tags",
				tags: [],
			});

			const found = await store.findById(record.id);
			expect(found?.metadata.tags).toEqual([]);
		});

		it("should handle empty scopes array", async () => {
			const { record } = await keys.create({
				ownerId: "user_empty_scopes",
				scopes: [],
			});

			const found = await store.findById(record.id);
			expect(found?.metadata.scopes).toEqual([]);
		});

		it("should handle empty resources object", async () => {
			const { record } = await keys.create({
				ownerId: "user_empty_resources",
				resources: {},
			});

			const found = await store.findById(record.id);
			expect(found?.metadata.resources).toEqual({});
		});

		it("should handle empty strings in text fields", async () => {
			const { record } = await keys.create({
				ownerId: "user_empty_strings",
				name: "",
				description: "",
			});

			const found = await store.findById(record.id);
			expect(found?.metadata.name).toBe("");
			expect(found?.metadata.description).toBe("");
		});

		it("should handle many scopes", async () => {
			const scopes = Array.from(
				{ length: MANY_SCOPES_COUNT },
				(_, i) => `scope_${i}`
			);

			const { record } = await keys.create({
				ownerId: "user_many_scopes",
				scopes,
			});

			const found = await store.findById(record.id);
			expect(found?.metadata.scopes).toEqual(scopes);
		});

		it("should handle large resource objects", async () => {
			const resourceScopes = ["read", "write"];
			const resources: Record<string, string[]> = {};
			for (let i = 0; i < LARGE_RESOURCES_COUNT; i++) {
				resources[`project:${i}`] = resourceScopes;
			}

			const { record } = await keys.create({
				ownerId: "user_large_resources",
				resources,
			});

			const found = await store.findById(record.id);
			expect(found?.metadata.resources).toEqual(resources);
		});

		it("should handle very long description text", async () => {
			const description = "A".repeat(LONG_DESCRIPTION_LENGTH);

			const { record } = await keys.create({
				ownerId: "user_long_desc",
				description,
			});

			const found = await store.findById(record.id);
			expect(found?.metadata.description).toBe(description);
		});

		it("should handle undefined vs empty tags array", async () => {
			const { record: r1 } = await keys.create({
				ownerId: "user_no_tags_1",
			});

			const { record: r2 } = await keys.create({
				ownerId: "user_no_tags_2",
				tags: [],
			});

			const found1 = await store.findById(r1.id);
			const found2 = await store.findById(r2.id);

			expect(found1).not.toBeNull();
			expect(found2).not.toBeNull();
		});

		it("should handle keys with no optional metadata fields", async () => {
			const { record } = await keys.create({
				ownerId: "user_minimal",
			});

			const found = await store.findById(record.id);
			expect(found).not.toBeNull();
			expect(found?.metadata.ownerId).toBe("user_minimal");
		});

		it("should handle null values correctly", async () => {
			const { record } = await keys.create({
				ownerId: "user_nulls",
				expiresAt: null,
				revokedAt: null,
				rotatedTo: null,
			});

			const found = await store.findById(record.id);
			expect(found?.metadata.expiresAt).toBeNull();
			expect(found?.metadata.revokedAt).toBeNull();
			expect(found?.metadata.rotatedTo).toBeNull();
		});

		it("should preserve boolean false values", async () => {
			const { record } = await keys.create({
				ownerId: "user_boolean",
				enabled: false,
			});

			const found = await store.findById(record.id);
			expect(found?.metadata.enabled).toBe(false);
		});

		it("should handle Unicode characters in strings", async () => {
			const { record } = await keys.create({
				ownerId: "user_unicode",
				name: "🔑 Test Key 测试",
				description: "Ключ тест مفتاح 🎉",
			});

			const found = await store.findById(record.id);
			expect(found?.metadata.name).toBe("🔑 Test Key 测试");
			expect(found?.metadata.description).toBe("Ключ тест مفتاح 🎉");
		});
	});

	describe("Complex Metadata Scenarios", () => {
		it("should handle keys with resources", async () => {
			const { record } = await keys.create({
				ownerId: "user_resources",
				resources: {
					"project:123": ["read", "write"],
					"project:456": ["read"],
				},
			});

			const found = await store.findById(record.id);

			expect(found?.metadata.resources).toEqual({
				"project:123": ["read", "write"],
				"project:456": ["read"],
			});
		});

		it("should handle expired keys", async () => {
			const { key, record } = await keys.create({
				ownerId: "user_expired",
				expiresAt: "2020-01-01T00:00:00.000Z",
			});

			const found = await store.findById(record.id);

			const verifyResult = await keys.verify(key);
			expect(verifyResult.valid).toBe(false);
			expect(verifyResult.error).toBe("API key has expired");
			expect(verifyResult.errorCode).toBe(ApiKeyErrorCode.EXPIRED);

			expect(found?.metadata.expiresAt).toBe("2020-01-01T00:00:00.000Z");
		});

		it("should handle revoked keys", async () => {
			const { key, record } = await keys.create({
				ownerId: "user_revoked",
			});

			await store.updateMetadata(record.id, {
				revokedAt: "2024-01-01T00:00:00.000Z",
				rotatedTo: "key_new",
			});

			const found = await store.findById(record.id);

			const verifyResult = await keys.verify(key);
			expect(verifyResult.valid).toBe(false);
			expect(verifyResult.error).toBe("API key has been revoked");
			expect(verifyResult.errorCode).toBe(ApiKeyErrorCode.REVOKED);

			expect(found?.metadata.revokedAt).toBe("2024-01-01T00:00:00.000Z");
			expect(found?.metadata.rotatedTo).toBe("key_new");
		});

		it("should handle disabled keys", async () => {
			const { key, record } = await keys.create({
				ownerId: "user_disabled",
				enabled: false,
			});

			const verifyResult = await keys.verify(key);
			expect(verifyResult.valid).toBe(false);
			expect(verifyResult.error).toBe("API key is disabled");
			expect(verifyResult.errorCode).toBe(ApiKeyErrorCode.DISABLED);

			const found = await store.findById(record.id);

			expect(found?.metadata.enabled).toBe(false);
		});

		it("should handle keys with all metadata fields", async () => {
			const oneDay = 86_400_000;
			const { record } = await keys.create({
				ownerId: "user_complete",
				name: "Complete Key",
				description: "A complete key with all fields",
				scopes: ["read", "write", "admin"],
				resources: {
					"project:123": ["read", "write"],
					"project:456": ["read"],
				},
				expiresAt: new Date(Date.now() + oneDay).toISOString(),
				enabled: true,
				tags: ["production", "api"],
			});

			const found = await store.findById(record.id);

			expect(found?.metadata.name).toBe("Complete Key");
			expect(found?.metadata.description).toBe(
				"A complete key with all fields"
			);
			expect(found?.metadata.scopes).toEqual(["read", "write", "admin"]);
			expect(found?.metadata.resources).toEqual({
				"project:123": ["read", "write"],
				"project:456": ["read"],
			});
			expect(found?.metadata.enabled).toBe(true);
			expect(found?.metadata.tags).toEqual(["production", "api"]);
		});

		it("should verify valid non-expired keys", async () => {
			const oneDay = 86_400_000;
			const { key, record } = await keys.create({
				ownerId: "user_valid",
				expiresAt: new Date(Date.now() + oneDay).toISOString(),
			});

			const verifyResult = await keys.verify(key);
			expect(verifyResult.valid).toBe(true);
			expect(verifyResult.record?.id).toBe(record.id);
		});

		it("should verify valid enabled keys", async () => {
			const { key, record } = await keys.create({
				ownerId: "user_enabled",
				enabled: true,
			});

			const verifyResult = await keys.verify(key);
			expect(verifyResult.valid).toBe(true);
			expect(verifyResult.record?.id).toBe(record.id);
		});

		it("should verify valid non-revoked keys", async () => {
			const { key, record } = await keys.create({
				ownerId: "user_not_revoked",
			});

			const verifyResult = await keys.verify(key);
			expect(verifyResult.valid).toBe(true);
			expect(verifyResult.record?.id).toBe(record.id);
		});
	});

	describe("Performance", () => {
		it(
			"should handle large dataset saves efficiently",
			async () => {
				const promises = Array.from({ length: STRESS_SAVES_COUNT }, (_, i) =>
					keys.create({
						ownerId: `user_${i % 10}`,
						name: `Key ${i}`,
					})
				);

				const start = performance.now();
				await Promise.all(promises);
				const duration = performance.now() - start;

				console.log(
					`Saved ${STRESS_SAVES_COUNT} keys in ${duration.toFixed(2)}ms`
				);
			},
			STRESS_TIMEOUT_MS
		);

		it(
			"should handle mixed operations efficiently",
			async () => {
				const records = await Promise.all(
					Array.from({ length: MIXED_OPS_COUNT }, (_, i) =>
						keys.create({
							ownerId: `user_${i % 10}`,
							name: `Key ${i}`,
						})
					)
				);

				const updatePromises = Array.from(
					{ length: MIXED_UPDATES_COUNT },
					(_, i) => {
						const record = records[i % records.length];
						return record
							? store.updateMetadata(record.record.id, {
									name: `Updated ${i}`,
								})
							: Promise.resolve();
					}
				);

				const deletePromises = Array.from(
					{ length: MIXED_DELETES_COUNT },
					(_, i) => {
						const index = records.length - ARRAY_OFFSET - (i % records.length);
						const record = records.at(index);
						return record ? store.delete(record.record.id) : Promise.resolve();
					}
				);

				await Promise.all([...updatePromises, ...deletePromises]);
			},
			STRESS_TIMEOUT_MS
		);
	});

	describe("Data Type Handling", () => {
		it("should handle nested objects in resources", async () => {
			const resources = {
				"project:123": ["read", "write"],
				"project:456": ["admin"],
			};

			const { record } = await keys.create({
				ownerId: "user_nested",
				resources,
			});

			const found = await store.findById(record.id);
			expect(found?.metadata.resources).toEqual(resources);
		});

		it("should handle ISO timestamp strings", async () => {
			const oneDay = 86_400_000;
			const now = new Date().toISOString();
			const future = new Date(Date.now() + oneDay).toISOString();

			const { record } = await keys.create({
				ownerId: "user_timestamps",
				createdAt: now,
				expiresAt: future,
			});

			const found = await store.findById(record.id);
			expect(found?.metadata.createdAt).toBe(now);
			expect(found?.metadata.expiresAt).toBe(future);
		});

		it("should preserve order in scopes arrays", async () => {
			const scopes = ["admin", "write", "read", "delete", "create"];

			const { record } = await keys.create({
				ownerId: "user_order",
				scopes,
			});

			const found = await store.findById(record.id);
			expect(found?.metadata.scopes).toEqual(scopes);
		});

		it("should handle duplicate values in arrays", async () => {
			const readScope = "read";
			const writeScope = "write";
			const scopes = [readScope, readScope, writeScope, readScope];

			const { record } = await keys.create({
				ownerId: "user_duplicates",
				scopes,
			});

			const found = await store.findById(record.id);
			expect(found?.metadata.scopes).toEqual(scopes);
		});
	});

	describe("Query Operations", () => {
		it("should handle multiple simultaneous queries", async () => {
			const queryRecordsCount = 20;
			const ownerModulo = 5;
			const tagModulo = 3;
			const records = await Promise.all(
				Array.from({ length: queryRecordsCount }, (_, i) =>
					keys.create({
						ownerId: `user_${i % ownerModulo}`,
						tags: [`tag_${i % tagModulo}`],
					})
				)
			);

			const promises = [
				...records.map(({ record }) => store.findById(record.id)),
				...records.map(({ record }) => store.findByHash(record.keyHash)),
				store.findByOwner("user_0"),
				store.findByOwner("user_1"),
				store.findByTag("tag_0"),
				store.findByTag("tag_1"),
			];

			const results = await Promise.all(promises);
			expect(results.length).toBe(promises.length);
		});
	});
});
