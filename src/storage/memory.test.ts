import { beforeEach, describe, expect, it } from "vitest";
import type { ApiKeyRecord } from "../types/api-key-types";
import { MemoryStore } from "./memory";

describe("MemoryStore", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  describe("save", () => {
    it("should save a record", async () => {
      const record: ApiKeyRecord = {
        id: "test-id",
        keyHash: "hash123",
        metadata: {
          ownerId: "user_123",
        },
      };

      await store.save(record);
      const found = await store.findById("test-id");
      expect(found).toEqual(record);
    });

    it("should overwrite existing record", async () => {
      const record1: ApiKeyRecord = {
        id: "test-id",
        keyHash: "hash123",
        metadata: { ownerId: "user_123" },
      };

      const record2: ApiKeyRecord = {
        id: "test-id",
        keyHash: "hash456",
        metadata: { ownerId: "user_456" },
      };

      await store.save(record1);
      await store.save(record2);

      const found = await store.findById("test-id");
      expect(found).toEqual(record2);
    });
  });

  describe("findByHash", () => {
    it("should find a record by hash", async () => {
      const record: ApiKeyRecord = {
        id: "test-id",
        keyHash: "hash123",
        metadata: { ownerId: "user_123" },
      };

      await store.save(record);
      const found = await store.findByHash("hash123");
      expect(found).toEqual(record);
    });

    it("should return null for non-existent hash", async () => {
      const found = await store.findByHash("non-existent");
      expect(found).toBeNull();
    });
  });

  describe("findById", () => {
    it("should find a record by ID", async () => {
      const record: ApiKeyRecord = {
        id: "test-id",
        keyHash: "hash123",
        metadata: { ownerId: "user_123" },
      };

      await store.save(record);
      const found = await store.findById("test-id");
      expect(found).toEqual(record);
    });

    it("should return null for non-existent ID", async () => {
      const found = await store.findById("non-existent");
      expect(found).toBeNull();
    });
  });

  describe("findByOwner", () => {
    it("should find all records for an owner", async () => {
      const record1: ApiKeyRecord = {
        id: "id1",
        keyHash: "hash1",
        metadata: { ownerId: "user_123" },
      };

      const record2: ApiKeyRecord = {
        id: "id2",
        keyHash: "hash2",
        metadata: { ownerId: "user_123" },
      };

      const record3: ApiKeyRecord = {
        id: "id3",
        keyHash: "hash3",
        metadata: { ownerId: "user_456" },
      };

      await store.save(record1);
      await store.save(record2);
      await store.save(record3);

      const found = await store.findByOwner("user_123");
      expect(found.length).toBe(2);
      expect(found).toContainEqual(record1);
      expect(found).toContainEqual(record2);
    });

    it("should return empty array for non-existent owner", async () => {
      const found = await store.findByOwner("non-existent");
      expect(found).toEqual([]);
    });
  });

  describe("updateMetadata", () => {
    it("should update metadata for a record", async () => {
      const record: ApiKeyRecord = {
        id: "test-id",
        keyHash: "hash123",
        metadata: { ownerId: "user_123", name: "Old Name" },
      };

      await store.save(record);
      await store.updateMetadata("test-id", { name: "New Name" });

      const found = await store.findById("test-id");
      expect(found?.metadata.name).toBe("New Name");
      expect(found?.metadata.ownerId).toBe("user_123");
    });

    it("should do nothing for non-existent ID", async () => {
      await store.updateMetadata("non-existent", { name: "New Name" });
      // Should not throw
    });
  });

  describe("delete", () => {
    it("should delete a record", async () => {
      const record: ApiKeyRecord = {
        id: "test-id",
        keyHash: "hash123",
        metadata: { ownerId: "user_123" },
      };

      await store.save(record);
      await store.delete("test-id");

      const found = await store.findById("test-id");
      expect(found).toBeNull();
    });

    it("should remove hash index when deleting", async () => {
      const record: ApiKeyRecord = {
        id: "test-id",
        keyHash: "hash123",
        metadata: { ownerId: "user_123" },
      };

      await store.save(record);
      await store.delete("test-id");

      const found = await store.findByHash("hash123");
      expect(found).toBeNull();
    });

    it("should do nothing for non-existent ID", async () => {
      await store.delete("non-existent");
      // Should not throw
    });
  });

  describe("deleteByOwner", () => {
    it("should delete all records for an owner", async () => {
      const record1: ApiKeyRecord = {
        id: "id1",
        keyHash: "hash1",
        metadata: { ownerId: "user_123" },
      };

      const record2: ApiKeyRecord = {
        id: "id2",
        keyHash: "hash2",
        metadata: { ownerId: "user_123" },
      };

      const record3: ApiKeyRecord = {
        id: "id3",
        keyHash: "hash3",
        metadata: { ownerId: "user_456" },
      };

      await store.save(record1);
      await store.save(record2);
      await store.save(record3);

      await store.deleteByOwner("user_123");

      const found123 = await store.findByOwner("user_123");
      const found456 = await store.findByOwner("user_456");

      expect(found123.length).toBe(0);
      expect(found456.length).toBe(1);
    });

    it("should do nothing for non-existent owner", async () => {
      await store.deleteByOwner("non-existent");
      // Should not throw
    });
  });
});
