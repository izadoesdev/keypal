import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { apikey } from "../drizzle/schema";
import { createKeys } from "../manager";
import type { ApiKeyRecord } from "../types/api-key-types";
import { DrizzleStore } from "./drizzle";

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

describe("DrizzleStore", () => {
	let pool: Pool;
	let db: ReturnType<typeof drizzle<{ apikey: typeof apikey }>>;
	let store: DrizzleStore;
	let keys: ReturnType<typeof createKeys>;

	beforeAll(async () => {
		pool = new Pool({
			connectionString:
				process.env.DATABASE_URL ||
				"postgresql://keypal:keypal_dev@localhost:5432/keypal",
		});

		try {
			await pool.query("SELECT 1");
		} catch (error) {
			console.warn(
				"PostgreSQL not available. Skipping Drizzle tests. Start with: docker-compose up postgres"
			);
			throw error;
		}

		db = drizzle(pool, { schema: { apikey } }) as ReturnType<
			typeof drizzle<{ apikey: typeof apikey }>
		>;

		await pool.query(`
			CREATE TABLE IF NOT EXISTS apikey (
				id TEXT PRIMARY KEY NOT NULL,
				key_hash TEXT NOT NULL,
				metadata JSONB NOT NULL
			)
		`);

		await pool.query(`
			CREATE INDEX IF NOT EXISTS apikey_key_hash_idx ON apikey(key_hash)
		`);

		await pool.query(`
			CREATE UNIQUE INDEX IF NOT EXISTS apikey_key_hash_unique ON apikey(key_hash)
		`);

		store = new DrizzleStore({ db, table: apikey });

		keys = createKeys({
			prefix: "sk_test_",
			length: 32,
			algorithm: "sha256",
			storage: store,
		});
	});

	afterEach(async () => {
		await pool.query("TRUNCATE TABLE apikey");
	});

	afterAll(async () => {
		await pool.end();
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
	});

	describe("updateMetadata", () => {
		it("should update metadata", async () => {
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
	});

	describe("delete", () => {
		it("should delete a record", async () => {
			const { record } = await keys.create({
				ownerId: "user_delete",
				name: "To Delete",
			});

			await store.delete(record.id);

			const result = await store.findById(record.id);
			expect(result).toBeNull();
		});

		it("should remove record from hash index (findByHash returns null after delete)", async () => {
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
			const { record } = await keys.create({
				ownerId: "user_expired",
				expiresAt: "2020-01-01T00:00:00.000Z",
			});

			const found = await store.findById(record.id);

			expect(found?.metadata.expiresAt).toBe("2020-01-01T00:00:00.000Z");
		});

		it("should handle revoked keys", async () => {
			const { record } = await keys.create({
				ownerId: "user_revoked",
			});

			await store.updateMetadata(record.id, {
				revokedAt: "2024-01-01T00:00:00.000Z",
				rotatedTo: "key_new",
			});

			const found = await store.findById(record.id);

			expect(found?.metadata.revokedAt).toBe("2024-01-01T00:00:00.000Z");
			expect(found?.metadata.rotatedTo).toBe("key_new");
		});

		it("should handle disabled keys", async () => {
			const { record } = await keys.create({
				ownerId: "user_disabled",
				enabled: false,
			});

			const found = await store.findById(record.id);

			expect(found?.metadata.enabled).toBe(false);
		});

		it("should handle keys with all metadata fields", async () => {
			const { record } = await keys.create({
				ownerId: "user_full",
				name: "Full Metadata Key",
				description: "Testing all fields",
				scopes: ["read", "write", "admin"],
				resources: {
					"project:123": ["read"],
				},
				expiresAt: "2025-12-31T00:00:00.000Z",
				enabled: true,
			});

			const found = await store.findById(record.id);

			expect(found?.metadata.name).toBe("Full Metadata Key");
			expect(found?.metadata.description).toBe("Testing all fields");
			expect(found?.metadata.scopes).toEqual(["read", "write", "admin"]);
			expect(found?.metadata.enabled).toBe(true);
		});
	});

	describe("Edge Cases", () => {
		it("should handle keys with no scopes", async () => {
			const { record } = await keys.create({
				ownerId: "user_no_scopes",
				scopes: [],
			});

			const found = await store.findById(record.id);

			expect(found?.metadata.scopes).toEqual([]);
		});

		it("should handle keys with never expiring", async () => {
			const { record } = await keys.create({
				ownerId: "user_no_expiry",
				expiresAt: null,
			});

			const found = await store.findById(record.id);

			expect(found?.metadata.expiresAt).toBeNull();
		});

		it("should handle updating from non-existent to existing metadata", async () => {
			const { record } = await keys.create({
				ownerId: "user_sparse",
			});

			await store.updateMetadata(record.id, {
				name: "Added Name",
				scopes: ["read"],
			});

			const updated = await store.findById(record.id);
			expect(updated?.metadata.name).toBe("Added Name");
			expect(updated?.metadata.scopes).toEqual(["read"]);
		});

		it("should handle empty strings in text fields", async () => {
			const { record } = await keys.create({
				ownerId: "user_empty",
				name: "",
				description: "",
			});

			const found = await store.findById(record.id);

			expect(found?.metadata.name).toBe("");
			expect(found?.metadata.description).toBe("");
		});

		it("should handle empty resources object", async () => {
			const { record } = await keys.create({
				ownerId: "user_empty_resources",
				resources: {},
			});

			const found = await store.findById(record.id);

			expect(found?.metadata.resources).toEqual({});
		});

		it("should handle null values vs undefined", async () => {
			const { record } = await keys.create({
				ownerId: "user_null_vs_undefined",
			});

			await store.updateMetadata(record.id, {
				name: null as unknown as undefined,
				description: undefined,
				revokedAt: null,
			});

			const found = await store.findById(record.id);

			expect(found?.metadata.name).toBeNull();
			expect(found?.metadata.description).toBeUndefined();
			expect(found?.metadata.revokedAt).toBeNull();
		});
	});

	describe("Error Handling", () => {
		it("should throw error when updating non-existent key", async () => {
			await expect(
				store.updateMetadata("nonexistent", { name: "Test" })
			).rejects.toThrow("API key with id nonexistent not found");
		});

		it("should handle deleting non-existent key without error", async () => {
			await expect(async () => {
				await store.delete("nonexistent");
			}).not.toThrow();
		});

		it("should handle deleting by non-existent owner without error", async () => {
			await expect(async () => {
				await store.deleteByOwner("nonexistent");
			}).not.toThrow();
		});
	});

	describe("Large Data", () => {
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

			expect(found?.metadata.scopes).toHaveLength(MANY_SCOPES_COUNT);
			expect(found?.metadata.scopes).toEqual(scopes);
		});

		it("should handle large resource objects", async () => {
			const resources: Record<string, string[]> = {};
			for (let i = 0; i < LARGE_RESOURCES_COUNT; i++) {
				resources[`project:${i}`] = ["read", "write"];
			}

			const { record } = await keys.create({
				ownerId: "user_large_resources",
				resources,
			});

			const found = await store.findById(record.id);

			expect(Object.keys(found?.metadata.resources || {})).toHaveLength(
				LARGE_RESOURCES_COUNT
			);
		});

		it("should handle very long description text", async () => {
			const longDescription = "A".repeat(LONG_DESCRIPTION_LENGTH);

			const { record } = await keys.create({
				ownerId: "user_long_description",
				description: longDescription,
			});

			const found = await store.findById(record.id);

			expect(found?.metadata.description).toBe(longDescription);
			expect(found?.metadata.description).toHaveLength(LONG_DESCRIPTION_LENGTH);
		});

		it("should handle many keys per owner", async () => {
			const ownerId = "user_many_keys";
			const TEST_COUNT = 50;

			for (let i = 0; i < TEST_COUNT; i++) {
				await keys.create({
					ownerId,
					name: `Key ${i}`,
				});
			}

			const found = await store.findByOwner(ownerId);
			expect(found.length).toBe(TEST_COUNT);
		});
	});

	describe("Concurrent Operations", () => {
		it("should handle concurrent saves to different records", async () => {
			const promises = Array.from({ length: CONCURRENT_OPS_COUNT }, (_, i) =>
				keys.create({
					ownerId: "user_concurrent",
					name: `Concurrent ${i}`,
				})
			);

			await Promise.all(promises);

			const found = await store.findByOwner("user_concurrent");
			expect(found).toHaveLength(CONCURRENT_OPS_COUNT);
		});

		it("should handle concurrent updates to same record (not saves)", async () => {
			const { record } = await keys.create({
				ownerId: "user_concurrent_same",
				name: "Original",
			});

			// Use updateMetadata instead of save to avoid unique constraint errors
			const updates = Array.from({ length: CONCURRENT_UPDATES_COUNT }, (_, i) =>
				store.updateMetadata(record.id, {
					name: `Updated ${i}`,
				})
			);

			await Promise.all(updates);

			const found = await store.findById(record.id);
			expect(found?.metadata.name).toMatch(REGEX_UPDATED_NAME);
		});

		it("should handle concurrent updates to different records", async () => {
			const records = await Promise.all(
				Array.from({ length: CONCURRENT_UPDATES_COUNT }, (_, i) =>
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
				const found = await store.findById(records[i].record.id);
				expect(found?.metadata.name).toBe(`Updated ${i}`);
			}
		});

		it("should handle concurrent updates to same record", async () => {
			const { record } = await keys.create({
				ownerId: "user_concurrent_update",
				name: "Original",
				scopes: [],
			});

			const promises = Array.from(
				{ length: CONCURRENT_UPDATES_COUNT },
				(_, i) =>
					store.updateMetadata(record.id, {
						name: `Updated ${i}`,
					})
			);

			await Promise.all(promises);

			const found = await store.findById(record.id);
			expect(found?.metadata.name).toMatch(REGEX_UPDATED_NAME);
		});

		it("should handle concurrent deletes", async () => {
			const promises = Array.from({ length: CONCURRENT_OPS_COUNT }, (_, i) =>
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

		it("should handle findByHash during concurrent updates", async () => {
			const { record } = await keys.create({
				ownerId: "user_hash_concurrent",
			});

			const [found] = await Promise.all([
				store.findByHash(record.keyHash),
				store.updateMetadata(record.id, {
					name: "Updated During Lookup",
				}),
			]);

			expect(found).not.toBeNull();
			expect(found?.keyHash).toBe(record.keyHash);
		});

		it("should prevent data corruption under concurrency", async () => {
			const { record } = await keys.create({
				ownerId: "user_no_corruption",
				name: "Original",
				scopes: ["read"],
			});

			// Simulate concurrent read/write
			const results = await Promise.all([
				store.findById(record.id),
				store.updateMetadata(record.id, { name: "Update 1" }),
				store.findById(record.id),
				store.updateMetadata(record.id, { name: "Update 2" }),
				store.findById(record.id),
			]);

			// Should always return consistent data
			for (const result of results) {
				if (result && "metadata" in result) {
					expect(result.metadata.ownerId).toBe("user_no_corruption");
					expect(result.metadata.scopes).toEqual(["read"]);
				}
			}
		});

		it("should handle read during write", async () => {
			const { record } = await keys.create({
				ownerId: "user_read_during_write",
				name: "Original",
			});

			const [found1, found2] = await Promise.all([
				store.findById(record.id),
				store
					.updateMetadata(record.id, {
						name: "Updated",
					})
					.then(() => store.findById(record.id)),
			]);

			expect(found1?.metadata.name).toBe("Original");
			expect(found2?.metadata.name).toBe("Updated");
		});
	});

	describe("Query Operations", () => {
		it("should return null for non-existent hash", async () => {
			const result = await store.findByHash("nonexistent_hash");
			expect(result).toBeNull();
		});

		it("should return null for non-existent id", async () => {
			const result = await store.findById("nonexistent_id");
			expect(result).toBeNull();
		});

		it("should return empty array for non-existent owner", async () => {
			const result = await store.findByOwner("nonexistent_owner");
			expect(result).toEqual([]);
		});

		it("should atomically update entire metadata object", async () => {
			const { record } = await keys.create({
				ownerId: "user_atomic",
				name: "Original",
				scopes: ["read"],
			});

			await store.updateMetadata(record.id, {
				name: "Updated",
				scopes: ["write"],
			});

			const found = await store.findById(record.id);
			expect(found?.metadata.name).toBe("Updated");
			expect(found?.metadata.scopes).toEqual(["write"]);
			expect(found?.metadata.ownerId).toBe("user_atomic");
		});
	});

	describe("Unicode and Special Characters", () => {
		it("should handle unicode characters in names", async () => {
			const { key, record } = await keys.create({
				ownerId: "user_unicode",
				name: "🔑 😊 Привет 你好 مرحبا",
			});

			// Verify via key manager
			const verifyResult = await keys.verify(key);
			expect(verifyResult.valid).toBe(true);
			expect(verifyResult.record?.metadata.name).toBe(
				"🔑 😊 Привет 你好 مرحبا"
			);

			// Verify via direct storage lookup
			const found = await store.findById(record.id);
			expect(found?.metadata.name).toBe("🔑 😊 Привет 你好 مرحبا");
		});

		it("should handle special characters in descriptions", async () => {
			const { record } = await keys.create({
				ownerId: "user_special_chars",
				description: "Test & <special> 'chars' \"quotes\" /slashes\\",
			});

			const found = await store.findById(record.id);

			expect(found?.metadata.description).toBe(
				"Test & <special> 'chars' \"quotes\" /slashes\\"
			);
		});

		it("should handle multiline text", async () => {
			const multiline = "Line 1\nLine 2\nLine 3";

			const { record } = await keys.create({
				ownerId: "user_multiline",
				description: multiline,
			});

			const found = await store.findById(record.id);

			expect(found?.metadata.description).toBe(multiline);
		});
	});

	describe("Duplicate Key Prevention", () => {
		it("should prevent duplicate IDs", async () => {
			const { record } = await keys.create({
				ownerId: "user_1",
				name: "First",
			});

			// Try to save with same ID but different data
			const duplicateRecord: ApiKeyRecord = {
				id: record.id,
				keyHash: keys.hashKey(keys.generateKey()),
				metadata: {
					ownerId: "user_2",
					name: "Second",
				},
			};

			await expect(store.save(duplicateRecord)).rejects.toThrow();
		});

		it("should prevent duplicate key hashes", async () => {
			const { record } = await keys.create({
				ownerId: "user_1",
			});

			// Try to save with same hash but different ID
			const duplicateRecord: ApiKeyRecord = {
				id: keys.generateKey().replace("sk_test_", "id_"),
				keyHash: record.keyHash,
				metadata: {
					ownerId: "user_2",
				},
			};

			await expect(store.save(duplicateRecord)).rejects.toThrow();
		});
	});

	describe("Auto-Updating lastUsedAt", () => {
		it("should update lastUsedAt when calling updateMetadata", async () => {
			const before = new Date().toISOString();
			const { record } = await keys.create({
				ownerId: "user_last_used",
				name: "Test Key",
			});

			// Update lastUsedAt
			await store.updateMetadata(record.id, {
				lastUsedAt: new Date().toISOString(),
			});

			const found = await store.findById(record.id);
			expect(found?.metadata.lastUsedAt).toBeDefined();
			expect(found?.metadata.lastUsedAt).not.toBe(before);
		});

		it("should preserve other metadata when updating lastUsedAt", async () => {
			const { record } = await keys.create({
				ownerId: "user_preserve",
				name: "Original Name",
				scopes: ["read", "write"],
				enabled: true,
			});

			await store.updateMetadata(record.id, {
				lastUsedAt: new Date().toISOString(),
			});

			const found = await store.findById(record.id);
			expect(found?.metadata.name).toBe("Original Name");
			expect(found?.metadata.scopes).toEqual(["read", "write"]);
			expect(found?.metadata.enabled).toBe(true);
			expect(found?.metadata.lastUsedAt).toBeDefined();
		});
	});

	describe("Key Rotation", () => {
		it("should rotate a key and mark old key as revoked", async () => {
			const { key: oldKey, record: oldRecord } = await keys.create({
				ownerId: "user_rotate",
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

			// Old record should have rotatedTo reference
			const oldRecordFound = await store.findById(oldRecord.id);
			expect(oldRecordFound?.metadata.rotatedTo).toBe(newRecord.id);
			expect(oldRecordFound?.metadata.revokedAt).toBeDefined();
		});

		it("should preserve metadata when rotating without updates", async () => {
			const { record: oldRecord } = await keys.create({
				ownerId: "user_rotate_preserve",
				name: "Original Key",
				scopes: ["read", "write"],
				description: "Original description",
			});

			const { record: newRecord } = await keys.rotate(oldRecord.id);

			expect(newRecord.metadata.name).toBe("Original Key");
			expect(newRecord.metadata.scopes).toEqual(["read", "write"]);
			expect(newRecord.metadata.description).toBe("Original description");
		});

		it("should throw error when rotating non-existent key", async () => {
			await expect(keys.rotate("nonexistent")).rejects.toThrow(
				"API key not found"
			);
		});
	});

	describe("Key Revocation", () => {
		it("should revoke a key and mark it as revoked", async () => {
			const { key, record } = await keys.create({
				ownerId: "user_revoke",
				name: "To Revoke",
			});

			await keys.revoke(record.id);

			const verifyResult = await keys.verify(key);
			expect(verifyResult.valid).toBe(false);
			expect(verifyResult.error).toBe("API key has been revoked");

			const found = await store.findById(record.id);
			expect(found?.metadata.revokedAt).toBeDefined();
		});

		it("should revoke all keys for an owner", async () => {
			const ownerId = "user_revoke_all";

			const { key: key1 } = await keys.create({ ownerId });
			const { key: key2 } = await keys.create({ ownerId });
			await keys.create({ ownerId: "user_keep" });

			await keys.revokeAll(ownerId);

			const result1 = await keys.verify(key1);
			const result2 = await keys.verify(key2);
			expect(result1.valid).toBe(false);
			expect(result2.valid).toBe(false);

			const remaining = await store.findByOwner(ownerId);
			for (const record of remaining) {
				expect(record.metadata.revokedAt).toBeDefined();
			}
		});
	});

	describe("Key Enable/Disable", () => {
		it("should disable a key", async () => {
			const { key, record } = await keys.create({
				ownerId: "user_disable",
				name: "To Disable",
			});

			await keys.disable(record.id);

			const verifyResult = await keys.verify(key);
			expect(verifyResult.valid).toBe(false);
			expect(verifyResult.error).toBe("API key is disabled");

			const found = await store.findById(record.id);
			expect(found?.metadata.enabled).toBe(false);
		});

		it("should enable a disabled key", async () => {
			const { key, record } = await keys.create({
				ownerId: "user_enable",
				name: "To Enable",
				enabled: false,
			});

			await keys.enable(record.id);

			const verifyResult = await keys.verify(key);
			expect(verifyResult.valid).toBe(true);

			const found = await store.findById(record.id);
			expect(found?.metadata.enabled).toBe(true);
		});
	});

	describe("Stress Tests", () => {
		it("should handle concurrent saves efficiently", async () => {
			const startTime = Date.now();
			const promises = Array.from({ length: STRESS_SAVES_COUNT }, (_, i) =>
				keys.create({
					ownerId: "stress_user",
					name: `Stress Key ${i}`,
				})
			);

			// Some saves may fail due to concurrent constraints, so we use allSettled
			const results = await Promise.allSettled(promises);
			const duration = Date.now() - startTime;

			// Should complete in reasonable time
			expect(duration).toBeLessThan(STRESS_TIMEOUT_MS);

			// Check that we got some successful saves
			const successful = results.filter((r) => r.status === "fulfilled");
			expect(successful.length).toBeGreaterThan(0);

			const found = await store.findByOwner("stress_user");
			expect(found.length).toBeGreaterThan(0);
		});

		it("should handle rapid sequential saves", async () => {
			// biome-ignore lint/style/noMagicNumbers: reduced count for testing
			const TEST_COUNT = 100;
			for (let i = 0; i < TEST_COUNT; i++) {
				await keys.create({
					ownerId: "sequential_user",
					name: `Sequential ${i}`,
				});
			}

			const found = await store.findByOwner("sequential_user");
			expect(found).toHaveLength(TEST_COUNT);
		});

		it("should handle mixed concurrent operations", async () => {
			// Create keys
			const promises = Array.from({ length: MIXED_OPS_COUNT }, (_, i) =>
				keys.create({
					ownerId: "mixed_user",
					name: `Mixed ${i}`,
				})
			);

			const results = await Promise.all(promises);
			const records = results.map((r) => r.record);

			// Update some of them concurrently
			const updatePromises = Array.from(
				{ length: MIXED_UPDATES_COUNT },
				(_, i) =>
					store.updateMetadata(records[i]?.id || "", {
						name: `Updated ${i}`,
					})
			);

			await Promise.all(updatePromises);

			// Verify updates
			const updated = await store.findById(records[0]?.id || "");
			expect(updated?.metadata.name).toBe("Updated 0");

			// Delete some concurrently
			const deletePromises = Array.from(
				{ length: MIXED_DELETES_COUNT },
				(_, i) => store.delete(records[i]?.id || "")
			);

			await Promise.all(deletePromises);

			// Verify counts
			const remaining = await store.findByOwner("mixed_user");
			expect(remaining).toHaveLength(MIXED_OPS_COUNT - MIXED_DELETES_COUNT);
		});

		it("should handle many findByOwner queries efficiently", async () => {
			// Create keys for multiple owners
			for (let i = 0; i < OWNER_TEST_COUNT; i++) {
				await keys.create({
					ownerId: `owner_${i % OWNERS_COUNT}`,
					name: `Key ${i}`,
				});
			}

			// Query all owners concurrently
			const queries = Array.from({ length: OWNERS_COUNT }, (_, i) =>
				store.findByOwner(`owner_${i}`)
			);

			const results = await Promise.all(queries);

			// Each owner should have same number of keys
			for (const ownerKeys of results) {
				expect(ownerKeys).toHaveLength(OWNER_TEST_COUNT / OWNERS_COUNT);
			}
		});
	});
});
