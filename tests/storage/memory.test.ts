import { beforeEach, describe, expect, it } from "vitest";
import { createKeys } from "@src/manager";
import type { ApiKeyRecord } from "@src/types/api-key-types";
import { MemoryStore } from "@src/storage/memory";

describe("MemoryStore", () => {
	let store: MemoryStore;
	let keys: ReturnType<typeof createKeys>;

	beforeEach(() => {
		store = new MemoryStore();
		keys = createKeys({
			prefix: "sk_test_",
			length: 32,
			algorithm: "sha256",
			storage: store,
		});
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

	describe("Edge Cases", () => {
		it("should handle empty tags array", async () => {
			const { record } = await keys.create({
				ownerId: "user_empty_tags",
				tags: [],
			});

			const found = await store.findById(record.id);
			expect(found?.metadata.tags).toEqual([]);
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

			// Both should handle tags gracefully
			expect(found1).not.toBeNull();
			expect(found2).not.toBeNull();
		});

		it("should handle keys with no metadata fields", async () => {
			const { record } = await keys.create({
				ownerId: "user_minimal",
			});

			const found = await store.findById(record.id);
			expect(found).not.toBeNull();
			expect(found?.metadata.ownerId).toBe("user_minimal");
		});
	});
});
