/** biome-ignore-all lint/suspicious/noConsole: benchmarking */
/** biome-ignore-all lint/style/noMagicNumbers: benchmarking */
/** biome-ignore-all lint/suspicious/noExplicitAny: benchmarking */
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

const memoryStorage = new MemoryStore();
const keys = createKeys({
	prefix: "sk_test_",
	length: 32,
	storage: memoryStorage,
	cache: true,
});

// Pre-create some keys for realistic scenarios
console.log("Setting up test data...");
const createdKeys: Array<{ key: string; record: any }> = [];

for (let i = 0; i < 100; i++) {
	const result = await keys.create({
		ownerId: `user_${i % 10}`,
		name: `Test Key ${i}`,
		scopes: ["read", "write"],
	});
	createdKeys.push(result);
}

const testKey = createdKeys[0]?.key;
const testRecord = createdKeys[0]?.record;
console.log("Setup complete\n");

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
const testHeaders = new Headers({
	authorization: `Bearer ${testKeyString}`,
});
const plainHeaders = {
	"x-api-key": testKeyString,
};
const futureDate = new Date(Date.now() + 86_400_000).toISOString(); // 24h from now
const pastDate = new Date(Date.now() - 86_400_000).toISOString(); // 24h ago
const cache = new MemoryCache();

async function main() {
	console.log("🚀 Running benchmarks...\n");

	// ============================================================
	// CORE UTILITIES - Raw Performance Metrics
	// ============================================================
	console.log("📦 Core Utilities Benchmarks\n");

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
			const headers = { authorization: `Bearer ${testKeyString}` };
			do_not_optimize(extractKeyFromHeaders(headers));
		});

		bench("extractKeyFromHeaders() - custom header", () => {
			const headers = { "x-custom-key": testKeyString };
			do_not_optimize(
				extractKeyFromHeaders(headers, { headerNames: ["x-custom-key"] })
			);
		});

		bench("hasApiKey() - present", () => {
			do_not_optimize(hasApiKey(testHeaders));
		});

		bench("hasApiKey() - missing", () => {
			const emptyHeaders = new Headers();
			do_not_optimize(hasApiKey(emptyHeaders));
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

		bench("hasScopeWithResources() - not found", () => {
			do_not_optimize(
				hasScopeWithResources(
					testScopes,
					testResources,
					"admin" as PermissionScope
				)
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

		bench("hasAnyScopeWithResources() - resource match", () => {
			do_not_optimize(
				hasAnyScopeWithResources(
					[],
					testResources,
					["deploy", "admin"] as PermissionScope[],
					{ resource: "project:789" }
				)
			);
		});

		bench("hasAllScopesWithResources() - global match", () => {
			do_not_optimize(
				hasAllScopesWithResources(testScopes, testResources, ["read", "write"])
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
			const builder = new ResourceBuilder();
			do_not_optimize(builder.add("website", "123", ["read", "write"]));
		});

		bench("ResourceBuilder.addMany() - 10 resources", () => {
			const builder = new ResourceBuilder();
			const ids = Array.from({ length: 10 }, (_, i) => `site_${i}`);
			do_not_optimize(builder.addMany("website", ids, ["read"]));
		});

		bench("ResourceBuilder.build() - 3 resources", () => {
			const builder = new ResourceBuilder()
				.add("website", "123", ["read", "write"])
				.add("project", "456", ["deploy"])
				.add("team", "789", ["manage"]);
			do_not_optimize(builder.build());
		});

		bench("ResourceBuilder.has()", () => {
			const builder = new ResourceBuilder().add("website", "123", ["read"]);
			do_not_optimize(builder.has("website", "123"));
		});

		bench("ResourceBuilder.get()", () => {
			const builder = new ResourceBuilder().add("website", "123", ["read"]);
			do_not_optimize(builder.get("website", "123"));
		});

		bench("ResourceBuilder.remove()", () => {
			const builder = new ResourceBuilder().add("website", "123", ["read"]);
			do_not_optimize(builder.remove("website", "123"));
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

		bench("MemoryCache.get() - hit", () => {
			cache.set("cached-key", "cached-value", 60);
			do_not_optimize(cache.get("cached-key"));
		});

		bench("MemoryCache.get() - miss", () => {
			do_not_optimize(cache.get("non-existent-key"));
		});

		bench("MemoryCache.del()", () => {
			cache.set("delete-key", "value", 60);
			cache.del("delete-key");
		});

		bench("MemoryCache.get() - expired", () => {
			cache.set("expired-key", "value", -1);
			do_not_optimize(cache.get("expired-key"));
		});
	});

	await run();

	console.log(`\n${"=".repeat(60)}\n`);
	console.log("🔧 High-Level API Benchmarks\n");

	// Key Generation & Hashing
	summary(() => {
		bench("generateKey()", () => {
			do_not_optimize(keys.generateKey());
		});

		bench("hashKey()", () => {
			do_not_optimize(keys.hashKey("sk_test_123456789012345678901234567890"));
		});

		bench("validateKey()", () => {
			const key = "sk_test_123456789012345678901234567890";
			const hash = keys.hashKey(key);
			do_not_optimize(keys.validateKey(key, hash));
		});
	});

	await run();

	if (!testKey) {
		throw new Error("Test key not found");
	}

	// Verification Operations
	summary(() => {
		bench("verify() - valid key (fresh)", async () => {
			// Clear cache first to ensure fresh lookup
			await keys.invalidateCache(testRecord.keyHash);
			const result = await keys.verify(testKey);
			do_not_optimize(result);
		});

		bench("verify() - valid key (cached)", async () => {
			// First verify to populate cache
			await keys.verify(testKey);
			// Then verify again (should hit cache)
			const result = await keys.verify(testKey);
			do_not_optimize(result);
		});

		bench("verify() - invalid key", async () => {
			const result = await keys.verify(
				"sk_test_invalid_key_that_does_not_exist"
			);
			do_not_optimize(result);
		});
	});

	await run();

	// CRUD Operations
	summary(() => {
		bench("create() - single key", async () => {
			const result = await keys.create({
				ownerId: "bench_user",
				name: "Bench Key",
				scopes: ["read"],
			});
			do_not_optimize(result);
		});

		bench("findById()", async () => {
			const result = await keys.findById(testRecord.id);
			do_not_optimize(result);
		});

		bench("findByHash()", async () => {
			const result = await keys.findByHash(testRecord.keyHash);
			do_not_optimize(result);
		});

		bench("list() - single owner", async () => {
			const result = await keys.list("user_0");
			do_not_optimize(result);
		});

		bench("updateLastUsed()", async () => {
			await keys.updateLastUsed(testRecord.id);
		});
	});

	await run();

	// Key Management
	summary(() => {
		bench("enable()", async () => {
			await keys.enable(testRecord.id);
		});

		bench("disable()", async () => {
			await keys.disable(testRecord.id);
		});

		bench("rotate()", async () => {
			const { record } = await keys.create({
				ownerId: "rotate_user",
				name: "Rotate Key",
			});
			const result = await keys.rotate(record.id);
			do_not_optimize(result);
		});
	});

	await run();

	// Bulk Operations
	summary(() => {
		bench("list() - 10 owners", async () => {
			const result = await Promise.all(
				Array.from({ length: 10 }, (_, i) => keys.list(`user_${i}`))
			);
			do_not_optimize(result);
		});

		bench("revokeAll() - 10 keys", async () => {
			const tempKeys = await Promise.all(
				Array.from({ length: 10 }, (_, i) =>
					keys.create({ ownerId: "temp_user", name: `Temp ${i}` })
				)
			);
			await keys.revokeAll("temp_user");
			do_not_optimize(tempKeys);
		});
	});

	await run();

	// Header Extraction
	summary(() => {
		bench("extractKey() - Headers object", () => {
			const headers = new Headers({
				authorization: `Bearer ${testKey}`,
			});
			do_not_optimize(keys.extractKey(headers));
		});

		bench("extractKey() - plain object", () => {
			const headers = {
				"x-api-key": testKey,
			};
			do_not_optimize(keys.extractKey(headers));
		});

		bench("hasKey()", () => {
			const headers = new Headers({
				authorization: `Bearer ${testKey}`,
			});
			do_not_optimize(keys.hasKey(headers));
		});
	});

	await run();

	// Storage Layer
	summary(() => {
		bench("storage.save()", async () => {
			const { record } = await keys.create({
				ownerId: "storage_user",
				name: "Storage Key",
			});
			await memoryStorage.save(record);
			do_not_optimize(record);
		});

		bench("storage.findByHash()", async () => {
			const result = await memoryStorage.findByHash(testRecord.keyHash);
			do_not_optimize(result);
		});

		bench("storage.findByOwner()", async () => {
			const result = await memoryStorage.findByOwner("user_0");
			do_not_optimize(result);
		});

		bench("storage.updateMetadata()", async () => {
			await memoryStorage.updateMetadata(testRecord.id, {
				lastUsedAt: new Date().toISOString(),
			});
		});
	});

	await run();

	console.log("\n✨ Benchmark complete!");
}

main().catch(console.error);
