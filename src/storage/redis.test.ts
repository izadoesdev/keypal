import Redis from "ioredis";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createKeys } from "../manager";
import type { ApiKeyRecord } from "../types/api-key-types";
import { RedisStore } from "./redis";

describe("RedisStore", () => {
	let redis: Redis;
	let store: RedisStore;
	let keys: ReturnType<typeof createKeys>;

	beforeEach(async () => {
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

		store = new RedisStore({ client: redis });
		keys = createKeys({
			prefix: "sk_test_",
			length: 32,
			algorithm: "sha256",
			storage: store,
		});

		// Clear test database with timeout
		await Promise.race([
			redis.flushdb(),
			new Promise((_, reject) =>
				// biome-ignore lint/style/noMagicNumbers: 2000ms timeout
				setTimeout(() => reject(new Error("flushdb timeout")), 2000)
			),
		]);
	});

	afterEach(async () => {
		await redis.quit();
	});

	describe("save", () => {
		it("should save a record", async () => {
			const { key, record } = await keys.create({
				ownerId: "user_123",
				name: "Test Key",
			});

			const found = await store.findById(record.id);
			expect(found).not.toBeNull();
			expect(found?.id).toBe(record.id);
			expect(found?.keyHash).toBe(record.keyHash);
			expect(found?.metadata.ownerId).toBe("user_123");

			// Verify we can verify the key
			const verifyResult = await keys.verify(key);
			expect(verifyResult.valid).toBe(true);
		});

		it("should throw error when saving duplicate ID", async () => {
			const { record: record1 } = await keys.create({
				ownerId: "user_123",
			});

			const record2: ApiKeyRecord = {
				id: record1.id,
				keyHash: keys.hashKey(keys.generateKey()),
				metadata: {
					ownerId: "user_456",
				},
			};

			await expect(store.save(record2)).rejects.toThrow(
				`API key with id ${record1.id} already exists`
			);

			// Original record should remain unchanged
			const found = await store.findById(record1.id);
			expect(found?.metadata.ownerId).toBe("user_123");
		});
	});

	describe("findByHash", () => {
		it("should find a record by hash", async () => {
			const { record } = await keys.create({
				ownerId: "user_456",
				name: "Found Key",
			});

			const found = await store.findByHash(record.keyHash);
			expect(found).not.toBeNull();
			expect(found?.keyHash).toBe(record.keyHash);
			expect(found?.metadata.ownerId).toBe("user_456");
			expect(found?.metadata.name).toBe("Found Key");
		});

		it("should return null for non-existent hash", async () => {
			const found = await store.findByHash("nonexistent_hash");
			expect(found).toBeNull();
		});
	});

	describe("findById", () => {
		it("should find a record by ID", async () => {
			const { record } = await keys.create({
				ownerId: "user_789",
				name: "By ID Key",
			});

			const found = await store.findById(record.id);
			expect(found).not.toBeNull();
			expect(found?.id).toBe(record.id);
			expect(found?.metadata.name).toBe("By ID Key");
		});

		it("should return null for non-existent ID", async () => {
			const found = await store.findById("non-existent");
			expect(found).toBeNull();
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

			const found = await store.findByOwner(ownerId);
			expect(found).toHaveLength(2);
			expect(found.some((r) => r.metadata.scopes?.includes("read"))).toBe(true);
			expect(found.some((r) => r.metadata.scopes?.includes("write"))).toBe(
				true
			);
		});

		it("should return empty array for non-existent owner", async () => {
			const found = await store.findByOwner("non-existent");
			expect(found).toEqual([]);
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
				tags: ["test", "key"], // Has both tags
			});

			const { record: r2 } = await keys.create({
				ownerId: "user_123",
				tags: ["test"], // Only has 'test', not 'key'
			});

			const found = await store.findByTags(["test", "key"]);
			expect(found).toHaveLength(2); // Should return BOTH records (OR logic)
			expect(found.some((r) => r.id === r1.id)).toBe(true);
			expect(found.some((r) => r.id === r2.id)).toBe(true);
		});

		it("should find all records by owner and tag", async () => {
			const { record } = await keys.create({
				ownerId: "user_123",
				tags: ["test"],
			});

			// Create a key with same tag but different owner
			await keys.create({
				ownerId: "user_456",
				tags: ["test"],
			});

			const found = await store.findByTag("test", "user_123");
			expect(found).toHaveLength(1);
			expect(found[0]?.id).toBe(record.id);
		});

		it("should find all records by owner and multiple tags", async () => {
			const { record } = await keys.create({
				ownerId: "user_123",
				tags: ["test", "key", "more", "tags"],
			});

			await keys.create({
				ownerId: "user_456",
				tags: ["test", "key"],
			});

			const found = await store.findByTags(["test", "key"], "user_123");
			expect(found).toHaveLength(1);
			expect(found[0]?.id).toBe(record.id);
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

		it("should throw error for non-existent ID", async () => {
			await expect(
				store.updateMetadata("non-existent", { name: "New Name" })
			).rejects.toThrow("API key with id non-existent not found");
		});

		it("should update tag indexes when adding tags", async () => {
			const { record } = await keys.create({
				ownerId: "user_tag_add",
				tags: ["tag1"],
			});

			await store.updateMetadata(record.id, {
				tags: ["tag1", "tag2", "tag3"],
			});

			// Verify tags can be found
			const found1 = await store.findByTag("tag1");
			const found2 = await store.findByTag("tag2");
			const found3 = await store.findByTag("tag3");

			expect(found1.some((r) => r.id === record.id)).toBe(true);
			expect(found2.some((r) => r.id === record.id)).toBe(true);
			expect(found3.some((r) => r.id === record.id)).toBe(true);
		});

		it("should update tag indexes when removing tags", async () => {
			const { record } = await keys.create({
				ownerId: "user_tag_remove",
				tags: ["tag1", "tag2", "tag3"],
			});

			await store.updateMetadata(record.id, {
				tags: ["tag1"],
			});

			// Verify only tag1 still has the record
			const found1 = await store.findByTag("tag1");
			const found2 = await store.findByTag("tag2");
			const found3 = await store.findByTag("tag3");

			expect(found1.some((r) => r.id === record.id)).toBe(true);
			expect(found2.some((r) => r.id === record.id)).toBe(false);
			expect(found3.some((r) => r.id === record.id)).toBe(false);
		});

		it("should update tag indexes when clearing all tags", async () => {
			const { record } = await keys.create({
				ownerId: "user_tag_clear",
				tags: ["tag1", "tag2"],
			});

			await store.updateMetadata(record.id, {
				tags: [],
			});

			// Verify no tags have the record
			const found1 = await store.findByTag("tag1");
			const found2 = await store.findByTag("tag2");

			expect(found1.some((r) => r.id === record.id)).toBe(false);
			expect(found2.some((r) => r.id === record.id)).toBe(false);
		});

		it("should update tag indexes when replacing tags", async () => {
			const { record } = await keys.create({
				ownerId: "user_tag_replace",
				tags: ["old1", "old2"],
			});

			await store.updateMetadata(record.id, {
				tags: ["new1", "new2"],
			});

			// Verify old tags don't have the record
			const foundOld1 = await store.findByTag("old1");
			const foundOld2 = await store.findByTag("old2");

			// Verify new tags have the record
			const foundNew1 = await store.findByTag("new1");
			const foundNew2 = await store.findByTag("new2");

			expect(foundOld1.some((r) => r.id === record.id)).toBe(false);
			expect(foundOld2.some((r) => r.id === record.id)).toBe(false);
			expect(foundNew1.some((r) => r.id === record.id)).toBe(true);
			expect(foundNew2.some((r) => r.id === record.id)).toBe(true);
		});

		it("should delete hash key when revoking", async () => {
			const { record } = await keys.create({
				ownerId: "user_revoke",
			});

			// Initially hash lookup works
			const foundBefore = await store.findByHash(record.keyHash);
			expect(foundBefore).not.toBeNull();

			// Revoke the key
			await store.updateMetadata(record.id, {
				revokedAt: new Date().toISOString(),
			});

			// After revocation, hash lookup should fail
			const foundAfter = await store.findByHash(record.keyHash);
			expect(foundAfter).toBeNull();

			// But the record itself should still exist
			const recordById = await store.findById(record.id);
			expect(recordById).not.toBeNull();
			expect(recordById?.metadata.revokedAt).toBeDefined();
		});

		it("should handle case-insensitive tags", async () => {
			const { record } = await keys.create({
				ownerId: "user_case",
				tags: ["TAG1", "Tag2"],
			});

			// Should find with lowercase
			const found1 = await store.findByTag("tag1");
			const found2 = await store.findByTag("tag2");

			expect(found1.some((r) => r.id === record.id)).toBe(true);
			expect(found2.some((r) => r.id === record.id)).toBe(true);
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

		it("should remove owner index when deleting", async () => {
			const { record } = await keys.create({
				ownerId: "user_owner_delete",
			});

			await store.delete(record.id);

			// Owner should no longer have this key
			const ownerKeys = await store.findByOwner("user_owner_delete");
			expect(ownerKeys.some((r) => r.id === record.id)).toBe(false);
		});

		it("should remove tag indexes when deleting", async () => {
			const { record } = await keys.create({
				ownerId: "user_tag_delete",
				tags: ["tag1", "tag2"],
			});

			await store.delete(record.id);

			// Tags should no longer have this key
			const found1 = await store.findByTag("tag1");
			const found2 = await store.findByTag("tag2");

			expect(found1.some((r) => r.id === record.id)).toBe(false);
			expect(found2.some((r) => r.id === record.id)).toBe(false);
		});

		it("should be idempotent (multiple deletes don't error)", async () => {
			const { record } = await keys.create({
				ownerId: "user_idempotent",
			});

			await store.delete(record.id);
			await store.delete(record.id);
			await store.delete(record.id);

			// Should not throw
			const result = await store.findById(record.id);
			expect(result).toBeNull();
		});

		it("should do nothing for non-existent ID", async () => {
			await store.delete("non-existent");
			// Should not throw
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

		it("should remove all hash indexes for deleted keys", async () => {
			const { record: record1 } = await keys.create({
				ownerId: "user_hash_delete_all",
			});
			const { record: record2 } = await keys.create({
				ownerId: "user_hash_delete_all",
			});

			await store.deleteByOwner("user_hash_delete_all");

			const found1 = await store.findByHash(record1.keyHash);
			const found2 = await store.findByHash(record2.keyHash);

			expect(found1).toBeNull();
			expect(found2).toBeNull();
		});

		it("should remove all tag indexes for deleted keys", async () => {
			const { record: record1 } = await keys.create({
				ownerId: "user_tag_delete_all",
				tags: ["tag1", "tag2"],
			});
			const { record: record2 } = await keys.create({
				ownerId: "user_tag_delete_all",
				tags: ["tag2", "tag3"],
			});

			await store.deleteByOwner("user_tag_delete_all");

			const found1 = await store.findByTag("tag1");
			const found2 = await store.findByTag("tag2");
			const found3 = await store.findByTag("tag3");

			expect(found1.some((r) => r.id === record1.id)).toBe(false);
			expect(found1.some((r) => r.id === record2.id)).toBe(false);
			expect(found2.some((r) => r.id === record1.id)).toBe(false);
			expect(found2.some((r) => r.id === record2.id)).toBe(false);
			expect(found3.some((r) => r.id === record1.id)).toBe(false);
			expect(found3.some((r) => r.id === record2.id)).toBe(false);
		});

		it("should be idempotent (multiple calls don't error)", async () => {
			await keys.create({
				ownerId: "user_idempotent_all",
			});

			await store.deleteByOwner("user_idempotent_all");
			await store.deleteByOwner("user_idempotent_all");
			await store.deleteByOwner("user_idempotent_all");

			// Should not throw
			const found = await store.findByOwner("user_idempotent_all");
			expect(found).toHaveLength(0);
		});

		it("should do nothing for non-existent owner", async () => {
			await store.deleteByOwner("non-existent");
			// Should not throw
		});
	});

	describe("setTtl", () => {
		it("should set TTL on a record", async () => {
			const { record } = await keys.create({
				ownerId: "user_123",
			});

			await store.setTtl(record.id, 10);

			const ttl = await redis.ttl(`apikey:${record.id}`);
			expect(ttl).toBeGreaterThan(0);
			expect(ttl).toBeLessThanOrEqual(10);
		});

		it("should do nothing for non-existent ID", async () => {
			await store.setTtl("non-existent", 10);
			// Should not throw
		});
	});

	describe("custom key prefix", () => {
		it("should use custom key prefix", async () => {
			const customStore = new RedisStore({
				client: redis,
				prefix: "custom:",
			});

			const customKeys = createKeys({
				prefix: "sk_test_",
				length: 32,
				algorithm: "sha256",
				storage: customStore,
			});

			const { key, record } = await customKeys.create({
				ownerId: "user_123",
			});

			const found = await customStore.findById(record.id);
			expect(found).not.toBeNull();
			expect(found?.id).toBe(record.id);

			// Verify the key works
			const verifyResult = await customKeys.verify(key);
			expect(verifyResult.valid).toBe(true);
		});
	});

	describe("Concurrent Operations", () => {
		it("should handle concurrent saves to different records", async () => {
			const promises = Array.from({ length: 10 }, (_, i) =>
				keys.create({
					ownerId: "user_concurrent",
					name: `Concurrent ${i}`,
				})
			);

			await Promise.all(promises);

			const found = await store.findByOwner("user_concurrent");
			expect(found).toHaveLength(10);
		});

		it("should handle concurrent updates to different records", async () => {
			const records = await Promise.all(
				Array.from({ length: 5 }, (_, i) =>
					keys.create({
						ownerId: "user_concurrent_update_diff",
						name: `Original ${i}`,
					})
				)
			);

			const promises = records.map((r, i) =>
				store.updateMetadata(r.record.id, {
					name: `Updated ${i}`,
				})
			);

			await Promise.all(promises);

			for (let i = 0; i < records.length; i++) {
				const record = records.at(i);
				if (!record) {
					continue;
				}
				const found = await store.findById(record.record.id);
				expect(found?.metadata.name).toBe(`Updated ${i}`);
			}
		});

		it("should handle concurrent deletes", async () => {
			const promises = Array.from({ length: 10 }, (_, i) =>
				keys.create({
					ownerId: "user_concurrent_delete",
					name: `Delete ${i}`,
				})
			);

			const results = await Promise.all(promises);
			const deletePromises = results.map((r) => store.delete(r.record.id));
			await Promise.all(deletePromises);

			const found = await store.findByOwner("user_concurrent_delete");
			expect(found).toHaveLength(0);
		});

		it("should handle concurrent tag updates", async () => {
			const { record } = await keys.create({
				ownerId: "user_concurrent_tags",
				tags: ["original"],
			});

			// Try to update tags concurrently
			const promises = [
				store.updateMetadata(record.id, { tags: ["tag1"] }),
				store.updateMetadata(record.id, { tags: ["tag2"] }),
				store.updateMetadata(record.id, { tags: ["tag3"] }),
			];

			await Promise.all(promises);

			// Should end up with one of the tags
			const found = await store.findById(record.id);
			expect(found?.metadata.tags).toBeDefined();
			expect(Array.isArray(found?.metadata.tags)).toBe(true);
		});
	});
});
