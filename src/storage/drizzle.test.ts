import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiKeyRecord } from "../types/api-key-types";
import { DrizzleStore } from "./drizzle";

describe("DrizzleStore", () => {
  let mockDb: any;
  let mockTable: any;
  let store: DrizzleStore;
  let capturedQueries: any[];

  beforeEach(() => {
    capturedQueries = [];

    // Mock table with column accessors
    mockTable = {
      id: "id_column",
      keyHash: "keyHash_column",
      ownerId: "ownerId_column",
      name: "name_column",
      description: "description_column",
      scopes: "scopes_column",
      expiresAt: "expiresAt_column",
      createdAt: "createdAt_column",
      lastUsedAt: "lastUsedAt_column",
    };

    // Mock Drizzle DB API
    mockDb = {
      insert: vi.fn((table) => {
        capturedQueries.push({ type: "insert", table });
        return {
          values: vi.fn((values) => {
            capturedQueries.push({ type: "insert.values", values });
            return Promise.resolve();
          }),
        };
      }),
      select: vi.fn(() => ({
        from: vi.fn((table) => {
          capturedQueries.push({ type: "select.from", table });
          return {
            where: vi.fn((condition) => {
              capturedQueries.push({ type: "select.where", condition });
              return {
                limit: vi.fn((n) => {
                  capturedQueries.push({ type: "select.limit", limit: n });
                  return Promise.resolve([]);
                }),
              };
            }),
          };
        }),
      })),
      update: vi.fn((table) => {
        capturedQueries.push({ type: "update", table });
        return {
          set: vi.fn((updates) => {
            capturedQueries.push({ type: "update.set", updates });
            return {
              where: vi.fn((condition) => {
                capturedQueries.push({ type: "update.where", condition });
                return Promise.resolve();
              }),
            };
          }),
        };
      }),
      delete: vi.fn((table) => {
        capturedQueries.push({ type: "delete", table });
        return {
          where: vi.fn((condition) => {
            capturedQueries.push({ type: "delete.where", condition });
            return Promise.resolve();
          }),
        };
      }),
    };

    store = new DrizzleStore({
      db: mockDb,
      table: mockTable,
    });
  });

  describe("Column Mapping - Default Names", () => {
    it("should use default column names when no mapping provided", async () => {
      const record: ApiKeyRecord = {
        id: "key_123",
        keyHash: "hash_abc",
        metadata: {
          ownerId: "user_123",
          name: "Test Key",
          description: "A test key",
          scopes: ["read", "write"],
          expiresAt: "2025-12-31T00:00:00.000Z",
          createdAt: "2025-01-01T00:00:00.000Z",
          lastUsedAt: undefined,
        },
      };

      await store.save(record);

      // Check that insert was called with correct table
      expect(capturedQueries[0].type).toBe("insert");
      expect(capturedQueries[0].table).toBe(mockTable);

      // Check that values contain the mapped columns with default names
      const insertedValues = capturedQueries[1].values;
      expect(insertedValues.id).toBe("key_123");
      expect(insertedValues.keyHash).toBe("hash_abc");
      expect(insertedValues.ownerId).toBe("user_123");
      expect(insertedValues.name).toBe("Test Key");
      expect(insertedValues.description).toBe("A test key");
      expect(insertedValues.scopes).toBe('["read","write"]'); // JSON stringified
      expect(insertedValues.expiresAt).toBe("2025-12-31T00:00:00.000Z");
    });
  });

  describe("Column Mapping - Custom Names", () => {
    it("should use custom column names when mapping provided", async () => {
      const customStore = new DrizzleStore({
        db: mockDb,
        table: mockTable,
        columns: {
          id: "api_key_id",
          keyHash: "hashed_key",
          ownerId: "user_id",
          name: "key_name",
          description: "key_description",
          scopes: "permissions",
          expiresAt: "expiration_date",
          createdAt: "date_created",
          lastUsedAt: "date_last_used",
        },
      });

      const record: ApiKeyRecord = {
        id: "key_456",
        keyHash: "hash_xyz",
        metadata: {
          ownerId: "user_456",
          name: "Custom Key",
          scopes: ["admin"],
        },
      };

      await customStore.save(record);

      const insertedValues = capturedQueries[1].values;
      expect(insertedValues.api_key_id).toBe("key_456");
      expect(insertedValues.hashed_key).toBe("hash_xyz");
      expect(insertedValues.user_id).toBe("user_456");
      expect(insertedValues.key_name).toBe("Custom Key");
      expect(insertedValues.permissions).toBe('["admin"]');
    });
  });

  describe("Query Generation - findByHash", () => {
    it("should generate correct query for findByHash", async () => {
      capturedQueries = []; // Reset

      mockDb.select = vi.fn(() => ({
        from: vi.fn((table) => {
          capturedQueries.push({ type: "select.from", table });
          return {
            where: vi.fn((condition) => {
              capturedQueries.push({ type: "select.where", condition });
              return {
                limit: vi.fn((n) => {
                  capturedQueries.push({ type: "select.limit", limit: n });
                  return Promise.resolve([
                    {
                      id: "key_123",
                      keyHash: "hash_abc",
                      ownerId: "user_123",
                      name: "Test Key",
                      scopes: '["read"]',
                      expiresAt: null,
                      createdAt: "2025-01-01",
                    },
                  ]);
                }),
              };
            }),
          };
        }),
      }));

      const result = await store.findByHash("hash_abc");

      expect(capturedQueries[0].type).toBe("select.from");
      expect(capturedQueries[0].table).toBe(mockTable);
      expect(capturedQueries[1].type).toBe("select.where");
      expect(capturedQueries[2].type).toBe("select.limit");
      expect(capturedQueries[2].limit).toBe(1);

      expect(result).not.toBeNull();
      expect(result?.keyHash).toBe("hash_abc");
      expect(result?.metadata.scopes).toEqual(["read"]);
    });
  });

  describe("Query Generation - findByOwner", () => {
    it("should generate correct query for findByOwner", async () => {
      capturedQueries = []; // Reset

      mockDb.select = vi.fn(() => ({
        from: vi.fn((table) => {
          capturedQueries.push({ type: "select.from", table });
          return {
            where: vi.fn((condition) => {
              capturedQueries.push({ type: "select.where", condition });
              return Promise.resolve([
                {
                  id: "key_1",
                  keyHash: "hash_1",
                  ownerId: "user_123",
                  scopes: '["read"]',
                },
                {
                  id: "key_2",
                  keyHash: "hash_2",
                  ownerId: "user_123",
                  scopes: '["write"]',
                },
              ]);
            }),
          };
        }),
      }));

      const results = await store.findByOwner("user_123");

      expect(capturedQueries[0].type).toBe("select.from");
      expect(capturedQueries[1].type).toBe("select.where");
      expect(results).toHaveLength(2);
      expect(results[0]?.metadata.scopes).toEqual(["read"]);
      expect(results[1]?.metadata.scopes).toEqual(["write"]);
    });
  });

  describe("Query Generation - updateMetadata", () => {
    it("should generate correct update query", async () => {
      await store.updateMetadata("key_123", {
        name: "Updated Name",
        scopes: ["admin", "write"],
      });

      expect(capturedQueries[0].type).toBe("update");
      expect(capturedQueries[0].table).toBe(mockTable);
      expect(capturedQueries[1].type).toBe("update.set");

      const updates = capturedQueries[1].updates;
      expect(updates.name).toBe("Updated Name");
      expect(updates.scopes).toBe('["admin","write"]');

      expect(capturedQueries[2].type).toBe("update.where");
    });

    it("should only update provided fields", async () => {
      await store.updateMetadata("key_123", {
        description: "New description",
      });

      const updates = capturedQueries[1].updates;
      expect(updates.description).toBe("New description");
      expect(updates.name).toBeUndefined();
      expect(updates.scopes).toBeUndefined();
    });
  });

  describe("Query Generation - delete", () => {
    it("should generate correct delete query", async () => {
      await store.delete("key_123");

      expect(capturedQueries[0].type).toBe("delete");
      expect(capturedQueries[0].table).toBe(mockTable);
      expect(capturedQueries[1].type).toBe("delete.where");
    });
  });

  describe("Query Generation - deleteByOwner", () => {
    it("should generate correct delete by owner query", async () => {
      await store.deleteByOwner("user_123");

      expect(capturedQueries[0].type).toBe("delete");
      expect(capturedQueries[1].type).toBe("delete.where");
    });
  });

  describe("Data Transformation - Row to Record", () => {
    it("should correctly transform database row to ApiKeyRecord", async () => {
      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() =>
              Promise.resolve([
                {
                  id: "key_123",
                  keyHash: "hash_abc",
                  ownerId: "user_123",
                  name: "Test Key",
                  description: "Description",
                  scopes: '["read","write","admin"]',
                  expiresAt: "2025-12-31T00:00:00.000Z",
                  createdAt: "2025-01-01T00:00:00.000Z",
                  lastUsedAt: "2025-01-15T00:00:00.000Z",
                },
              ])
            ),
          })),
        })),
      }));

      const record = await store.findById("key_123");

      expect(record).not.toBeNull();
      expect(record?.id).toBe("key_123");
      expect(record?.keyHash).toBe("hash_abc");
      expect(record?.metadata.ownerId).toBe("user_123");
      expect(record?.metadata.name).toBe("Test Key");
      expect(record?.metadata.description).toBe("Description");
      expect(record?.metadata.scopes).toEqual(["read", "write", "admin"]);
      expect(record?.metadata.expiresAt).toBe("2025-12-31T00:00:00.000Z");
      expect(record?.metadata.createdAt).toBe("2025-01-01T00:00:00.000Z");
      expect(record?.metadata.lastUsedAt).toBe("2025-01-15T00:00:00.000Z");
    });

    it("should handle null/undefined values correctly", async () => {
      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() =>
              Promise.resolve([
                {
                  id: "key_123",
                  keyHash: "hash_abc",
                  ownerId: "user_123",
                  name: null,
                  description: null,
                  scopes: null,
                  expiresAt: null,
                  createdAt: "2025-01-01",
                  lastUsedAt: null,
                },
              ])
            ),
          })),
        })),
      }));

      const record = await store.findById("key_123");

      expect(record?.metadata.name).toBeUndefined();
      expect(record?.metadata.description).toBeUndefined();
      expect(record?.metadata.scopes).toBeUndefined();
      expect(record?.metadata.expiresAt).toBeNull();
      expect(record?.metadata.lastUsedAt).toBeUndefined();
    });
  });

  describe("Data Transformation - Record to Row", () => {
    it("should correctly serialize scopes to JSON", async () => {
      const record: ApiKeyRecord = {
        id: "key_123",
        keyHash: "hash_abc",
        metadata: {
          ownerId: "user_123",
          scopes: ["read", "write", "admin"],
        },
      };

      await store.save(record);

      const insertedValues = capturedQueries[1].values;
      expect(insertedValues.scopes).toBe('["read","write","admin"]');
    });

    it("should handle empty scopes array", async () => {
      const record: ApiKeyRecord = {
        id: "key_123",
        keyHash: "hash_abc",
        metadata: {
          ownerId: "user_123",
          scopes: [],
        },
      };

      await store.save(record);

      const insertedValues = capturedQueries[1].values;
      expect(insertedValues.scopes).toBe("[]");
    });

    it("should handle undefined scopes", async () => {
      const record: ApiKeyRecord = {
        id: "key_123",
        keyHash: "hash_abc",
        metadata: {
          ownerId: "user_123",
          scopes: undefined,
        },
      };

      await store.save(record);

      const insertedValues = capturedQueries[1].values;
      expect(insertedValues.scopes).toBeNull();
    });
  });

  describe("Integration with Custom Table Structure", () => {
    it("should work with a table that has completely different column names", async () => {
      const customTable = {
        user_api_key_id: "col1",
        api_key_hash_value: "col2",
        owner_user_id: "col3",
        api_key_display_name: "col4",
        api_key_notes: "col5",
        permission_list: "col6",
        expires_on: "col7",
        created_on: "col8",
        last_accessed: "col9",
      };

      const customStore = new DrizzleStore({
        db: mockDb,
        table: customTable,
        columns: {
          id: "user_api_key_id",
          keyHash: "api_key_hash_value",
          ownerId: "owner_user_id",
          name: "api_key_display_name",
          description: "api_key_notes",
          scopes: "permission_list",
          expiresAt: "expires_on",
          createdAt: "created_on",
          lastUsedAt: "last_accessed",
        },
      });

      const record: ApiKeyRecord = {
        id: "abc123",
        keyHash: "hash999",
        metadata: {
          ownerId: "user789",
          name: "My API Key",
          description: "For production",
          scopes: ["full_access"],
        },
      };

      await customStore.save(record);

      const insertedValues = capturedQueries[1].values;
      expect(insertedValues.user_api_key_id).toBe("abc123");
      expect(insertedValues.api_key_hash_value).toBe("hash999");
      expect(insertedValues.owner_user_id).toBe("user789");
      expect(insertedValues.api_key_display_name).toBe("My API Key");
      expect(insertedValues.api_key_notes).toBe("For production");
      expect(insertedValues.permission_list).toBe('["full_access"]');
    });
  });
});
