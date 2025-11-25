/**
 * High-Level API Benchmarks using mitata
 *
 * Tests the full ApiKeyManager API including verification, CRUD operations,
 * caching behavior, and bulk operations.
 *
 * Run: bun run benchmark.ts
 */
// @ts-nocheck
import { bench, do_not_optimize, run, summary } from "mitata";
import { MemoryCache } from "./src/core/cache";
import { getExpirationTime, isExpired } from "./src/core/expiration";
import { extractKeyFromHeaders, hasApiKey } from "./src/core/extract-key";
import { generateKey } from "./src/core/generate";
import { hashKey } from "./src/core/hash";
import { ResourceBuilder } from "./src/core/resources";
import {
	hasAllScopes,
	hasAllScopesWithResources,
	hasAnyScope,
	hasAnyScopeWithResources,
	hasScope,
	hasScopeWithResources,
} from "./src/core/scopes";
import { validateKey } from "./src/core/validate";
import { createKeys } from "./src/manager";
import { MemoryStore } from "./src/storage/memory";
import type { PermissionScope } from "./src/types/permissions-types";

// ============================================================
// Setup
// ============================================================
const memoryStorage = new MemoryStore();
const keys = createKeys({
	prefix: "sk_test_",
	length: 32,
	storage: memoryStorage,
	cache: true,
	auditLogs: true,
});

console.log("📦 Setting up test data...");
const createdKeys: Array<{ key: string; record: any }> = [];

for (let i = 0; i < 100; i++) {
	const result = await keys.create({
		ownerId: `user_${i % 10}`,
		name: `Test Key ${i}`,
		scopes: ["read", "write"],
		tags: [`env:${i % 2 === 0 ? "prod" : "dev"}`, `team:${i % 5}`],
	});
	createdKeys.push(result);
}

const testKey = createdKeys[0]?.key;
const testRecord = createdKeys[0]?.record;
console.log(`✅ Created ${createdKeys.length} test keys\n`);

// Test data for core benchmarks
const testKeyString = "sk_test_abcdef1234567890ABCDEF1234567890";
const testKeyHash = hashKey(testKeyString);
const testScopes: PermissionScope[] = ["read", "write", "delete"];
const largeScopes: PermissionScope[] = Array.from(
	{ length: 50 },
	(_, i) => `scope_${i}` as PermissionScope
);
const testResources = {
	"website:123": ["read", "write"] as PermissionScope[],
	"website:456": ["read"] as PermissionScope[],
	"project:789": ["deploy", "manage"] as PermissionScope[],
};
const testHeaders = new Headers({ authorization: `Bearer ${testKeyString}` });
const plainHeaders = { "x-api-key": testKeyString };
const futureDate = new Date(Date.now() + 86_400_000).toISOString();
const pastDate = new Date(Date.now() - 86_400_000).toISOString();
const cache = new MemoryCache();

async function main() {
	console.log("🚀 Running benchmarks...\n");

	// ============================================================
	// CORE UTILITIES
	// ============================================================
	console.log("━━━ Core Utilities ━━━\n");

	// Key Generation
	summary(() => {
		bench("generateKey() - default (32 chars)", () => {
			do_not_optimize(generateKey());
		});

		bench("generateKey() - with prefix", () => {
			do_not_optimize(generateKey({ prefix: "sk_test_", length: 32 }));
		});

		bench("generateKey() - short (16 chars)", () => {
			do_not_optimize(generateKey({ length: 16 }));
		});

		bench("generateKey() - long (64 chars)", () => {
			do_not_optimize(generateKey({ length: 64 }));
		});
	});
	await run();

	// Hashing & Validation
	summary(() => {
		bench("hashKey() - SHA-256", () => {
			do_not_optimize(hashKey(testKeyString));
		});

		bench("hashKey() - SHA-512", () => {
			do_not_optimize(hashKey(testKeyString, { algorithm: "sha512" }));
		});

		bench("hashKey() - with salt", () => {
			do_not_optimize(hashKey(testKeyString, { salt: "my-salt" }));
		});

		bench("validateKey() - matching", () => {
			do_not_optimize(validateKey(testKeyString, testKeyHash));
		});

		bench("validateKey() - non-matching", () => {
			do_not_optimize(validateKey("sk_test_invalid", testKeyHash));
		});
	});
	await run();

	// Header Extraction
	summary(() => {
		bench("extractKeyFromHeaders() - Headers object", () => {
			do_not_optimize(extractKeyFromHeaders(testHeaders));
		});

		bench("extractKeyFromHeaders() - plain object", () => {
			do_not_optimize(extractKeyFromHeaders(plainHeaders));
		});

		bench("extractKeyFromHeaders() - with Bearer", () => {
			do_not_optimize(
				extractKeyFromHeaders({ authorization: `Bearer ${testKeyString}` })
			);
		});

		bench("extractKeyFromHeaders() - custom header", () => {
			do_not_optimize(
				extractKeyFromHeaders(
					{ "x-custom-key": testKeyString },
					{ headerNames: ["x-custom-key"] }
				)
			);
		});

		bench("hasApiKey() - present", () => {
			do_not_optimize(hasApiKey(testHeaders));
		});

		bench("hasApiKey() - missing", () => {
			do_not_optimize(hasApiKey(new Headers()));
		});
	});
	await run();

	// Expiration Checks
	summary(() => {
		bench("isExpired() - future date", () => {
			do_not_optimize(isExpired(futureDate));
		});

		bench("isExpired() - past date", () => {
			do_not_optimize(isExpired(pastDate));
		});

		bench("isExpired() - null", () => {
			do_not_optimize(isExpired(null));
		});

		bench("getExpirationTime() - valid date", () => {
			do_not_optimize(getExpirationTime(futureDate));
		});

		bench("getExpirationTime() - null", () => {
			do_not_optimize(getExpirationTime(null));
		});
	});
	await run();

	// Scope Checking
	summary(() => {
		bench("hasScope() - found (3 scopes)", () => {
			do_not_optimize(hasScope(testScopes, "read"));
		});

		bench("hasScope() - not found (3 scopes)", () => {
			do_not_optimize(hasScope(testScopes, "admin" as PermissionScope));
		});

		bench("hasScope() - found (50 scopes)", () => {
			do_not_optimize(hasScope(largeScopes, "scope_25" as PermissionScope));
		});

		bench("hasAnyScope() - first match", () => {
			do_not_optimize(
				hasAnyScope(testScopes, ["read", "admin"] as PermissionScope[])
			);
		});

		bench("hasAnyScope() - no match", () => {
			do_not_optimize(
				hasAnyScope(testScopes, ["admin", "super"] as PermissionScope[])
			);
		});

		bench("hasAllScopes() - all match", () => {
			do_not_optimize(hasAllScopes(testScopes, ["read", "write"]));
		});

		bench("hasAllScopes() - partial match", () => {
			do_not_optimize(
				hasAllScopes(testScopes, ["read", "admin"] as PermissionScope[])
			);
		});
	});
	await run();

	// Resource-based Scope Checking
	summary(() => {
		bench("hasScopeWithResources() - global scope", () => {
			do_not_optimize(hasScopeWithResources(testScopes, testResources, "read"));
		});

		bench("hasScopeWithResources() - resource scope", () => {
			do_not_optimize(
				hasScopeWithResources(testScopes, testResources, "deploy", {
					resource: "project:789",
				})
			);
		});

		bench("hasAnyScopeWithResources() - global match", () => {
			do_not_optimize(
				hasAnyScopeWithResources(testScopes, testResources, [
					"read",
					"admin",
				] as PermissionScope[])
			);
		});

		bench("hasAllScopesWithResources() - resource match", () => {
			do_not_optimize(
				hasAllScopesWithResources([], testResources, ["read", "write"], {
					resource: "website:123",
				})
			);
		});
	});
	await run();

	// Resource Builder
	summary(() => {
		bench("ResourceBuilder.add() - single", () => {
			do_not_optimize(
				new ResourceBuilder().add("website", "123", ["read", "write"])
			);
		});

		bench("ResourceBuilder.addMany() - 10 resources", () => {
			const ids = Array.from({ length: 10 }, (_, i) => `site_${i}`);
			do_not_optimize(new ResourceBuilder().addMany("website", ids, ["read"]));
		});

		bench("ResourceBuilder.build() - 3 resources", () => {
			do_not_optimize(
				new ResourceBuilder()
					.add("website", "123", ["read"])
					.add("project", "456", ["deploy"])
					.add("team", "789", ["manage"])
					.build()
			);
		});

		bench("ResourceBuilder.from()", () => {
			do_not_optimize(ResourceBuilder.from(testResources));
		});
	});
	await run();

	// Cache Operations
	summary(() => {
		bench("MemoryCache.set()", () => {
			cache.set("test-key", "test-value", 60);
		});

		cache.set("cached-key", "cached-value", 60);
		bench("MemoryCache.get() - hit", () => {
			do_not_optimize(cache.get("cached-key"));
		});

		bench("MemoryCache.get() - miss", () => {
			do_not_optimize(cache.get("non-existent-key"));
		});

		bench("MemoryCache.del()", () => {
			cache.set("delete-key", "value", 60);
			cache.del("delete-key");
		});
	});
	await run();

	// ============================================================
	// HIGH-LEVEL API
	// ============================================================
	console.log("\n━━━ High-Level API ━━━\n");

	if (!testKey) {
		throw new Error("Test key not found");
	}

	// Manager Key Operations
	summary(() => {
		bench("manager.generateKey()", () => {
			do_not_optimize(keys.generateKey());
		});

		bench("manager.hashKey()", () => {
			do_not_optimize(keys.hashKey(testKeyString));
		});

		bench("manager.validateKey()", () => {
			const hash = keys.hashKey(testKeyString);
			do_not_optimize(keys.validateKey(testKeyString, hash));
		});

		bench("manager.extractKey() - Headers", () => {
			const headers = new Headers({ authorization: `Bearer ${testKey}` });
			do_not_optimize(keys.extractKey(headers));
		});

		bench("manager.hasKey()", () => {
			const headers = new Headers({ authorization: `Bearer ${testKey}` });
			do_not_optimize(keys.hasKey(headers));
		});
	});
	await run();

	await keys.verify(testKey);

	summary(() => {
		bench("verify() - valid key (fresh)", async () => {
			await keys.invalidateCache(testRecord.keyHash);
			do_not_optimize(await keys.verify(testKey));
		});

		bench("verify() - valid key (cached)", async () => {
			do_not_optimize(await keys.verify(testKey));
		});

		bench("verify() - invalid key", async () => {
			do_not_optimize(await keys.verify("sk_test_invalid_key_does_not_exist"));
		});

		bench("verifyFromHeaders()", async () => {
			const headers = new Headers({ authorization: `Bearer ${testKey}` });
			do_not_optimize(await keys.verifyFromHeaders(headers));
		});
	});
	await run();

	// CRUD Operations
	summary(() => {
		bench("create()", async () => {
			do_not_optimize(
				await keys.create({
					ownerId: "bench_user",
					name: "Bench Key",
					scopes: ["read"],
				})
			);
		});

		bench("findById()", async () => {
			do_not_optimize(await keys.findById(testRecord.id));
		});

		bench("findByHash()", async () => {
			do_not_optimize(await keys.findByHash(testRecord.keyHash));
		});

		bench("list() - single owner", async () => {
			do_not_optimize(await keys.list("user_0"));
		});

		bench("updateLastUsed()", async () => {
			await keys.updateLastUsed(testRecord.id);
		});
	});
	await run();

	// Tag Operations
	summary(() => {
		bench("findByTag()", async () => {
			do_not_optimize(await keys.findByTag("env:prod"));
		});

		bench("findByTag() - with owner", async () => {
			do_not_optimize(await keys.findByTag("env:prod", "user_0"));
		});

		bench("findByTags() - multiple", async () => {
			do_not_optimize(await keys.findByTags(["env:prod", "team:1"]));
		});
	});
	await run();

	// Key Management
	summary(() => {
		bench("enable()", async () => {
			try {
				await keys.enable(testRecord.id);
			} catch {
				// Key may already be enabled
			}
		});

		bench("disable()", async () => {
			try {
				await keys.disable(testRecord.id);
			} catch {
				// Key may already be disabled
			}
		});

		bench("rotate()", async () => {
			const { record } = await keys.create({
				ownerId: "rotate_user",
				name: "Rotate Key",
			});
			do_not_optimize(await keys.rotate(record.id));
		});
	});
	await run();

	// Scope Checking on Records
	summary(() => {
		bench("manager.hasScope()", () => {
			do_not_optimize(keys.hasScope(testRecord, "read"));
		});

		bench("manager.hasAnyScope()", () => {
			do_not_optimize(keys.hasAnyScope(testRecord, ["read", "admin"]));
		});

		bench("manager.hasAllScopes()", () => {
			do_not_optimize(keys.hasAllScopes(testRecord, ["read", "write"]));
		});

		bench("manager.checkResourceScope()", () => {
			do_not_optimize(
				keys.checkResourceScope(testRecord, "website", "123", "read")
			);
		});
	});
	await run();

	// ============================================================
	// BULK OPERATIONS
	// ============================================================
	console.log("\n━━━ Bulk Operations ━━━\n");

	summary(() => {
		bench("list() - 10 owners parallel", async () => {
			do_not_optimize(
				await Promise.all(
					Array.from({ length: 10 }, (_, i) => keys.list(`user_${i}`))
				)
			);
		});

		bench("verify() - 10 keys parallel", async () => {
			const keysToVerify = createdKeys.slice(0, 10).map((k) => k.key);
			do_not_optimize(
				await Promise.all(keysToVerify.map((k) => keys.verify(k)))
			);
		});

		bench("create() - 10 keys parallel", async () => {
			do_not_optimize(
				await Promise.all(
					Array.from({ length: 10 }, (_, i) =>
						keys.create({ ownerId: "bulk_user", name: `Bulk Key ${i}` })
					)
				)
			);
		});

		bench("findById() - 10 keys parallel", async () => {
			const ids = createdKeys.slice(0, 10).map((k) => k.record.id);
			do_not_optimize(await Promise.all(ids.map((id) => keys.findById(id))));
		});
	});
	await run();

	// ============================================================
	// CONCURRENCY STRESS TESTS
	// ============================================================
	console.log("\n━━━ Concurrency Stress Tests ━━━\n");

	summary(() => {
		bench("verify() - 50 concurrent", async () => {
			do_not_optimize(
				await Promise.all(Array.from({ length: 50 }, () => keys.verify(testKey)))
			);
		});

		bench("verify() - 100 concurrent", async () => {
			do_not_optimize(
				await Promise.all(
					Array.from({ length: 100 }, () => keys.verify(testKey))
				)
			);
		});

		bench("mixed operations - 50 concurrent", async () => {
			const operations = Array.from({ length: 50 }, (_, i) => {
				const mod = i % 4;
				if (mod === 0) return keys.verify(testKey);
				if (mod === 1) return keys.findById(testRecord.id);
				if (mod === 2) return keys.list(`user_${i % 10}`);
				return keys.findByTag("env:prod");
			});
			do_not_optimize(await Promise.all(operations));
		});
	});
	await run();

	// ============================================================
	// STORAGE LAYER
	// ============================================================
	console.log("\n━━━ Storage Layer ━━━\n");

	summary(() => {
		bench("storage.findById()", async () => {
			do_not_optimize(await memoryStorage.findById(testRecord.id));
		});

		bench("storage.findByHash()", async () => {
			do_not_optimize(await memoryStorage.findByHash(testRecord.keyHash));
		});

		bench("storage.findByOwner()", async () => {
			do_not_optimize(await memoryStorage.findByOwner("user_0"));
		});

		bench("storage.updateMetadata()", async () => {
			await memoryStorage.updateMetadata(testRecord.id, {
				lastUsedAt: new Date().toISOString(),
			});
		});

		bench("storage.findByTag()", async () => {
			do_not_optimize(await memoryStorage.findByTag("env:prod"));
		});

		bench("storage.findByTags()", async () => {
			do_not_optimize(
				await memoryStorage.findByTags(["env:prod", "team:1"])
			);
		});
	});
	await run();

	// ============================================================
	// AUDIT LOGS
	// ============================================================
	console.log("\n━━━ Audit Log Operations ━━━\n");

	summary(() => {
		bench("getLogs() - no filter", async () => {
			do_not_optimize(await keys.getLogs({}));
		});

		bench("getLogs() - by keyId", async () => {
			do_not_optimize(await keys.getLogs({ keyId: testRecord.id }));
		});

		bench("getLogs() - by ownerId", async () => {
			do_not_optimize(await keys.getLogs({ ownerId: "user_0" }));
		});

		bench("getLogs() - by action", async () => {
			do_not_optimize(await keys.getLogs({ action: "created" }));
		});

		bench("countLogs()", async () => {
			do_not_optimize(await keys.countLogs({ ownerId: "user_0" }));
		});

		bench("getLogStats()", async () => {
			do_not_optimize(await keys.getLogStats("user_0"));
		});
	});
	await run();

	console.log("\n✨ Benchmark complete!");
}

main().catch(console.error);
