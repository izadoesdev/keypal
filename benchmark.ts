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

		bench("generateKey() - with prefix", function* (ctx) {
			const options = ctx.get("options");
			yield {
				[0]() {
					return options;
				},
				bench(opts) {
					return do_not_optimize(generateKey(opts));
				},
			};
		}).args("options", [{ prefix: "sk_test_", length: 32 }]);

		bench("generateKey() - short (16 chars)", function* (ctx) {
			const options = ctx.get("options");
			yield {
				[0]() {
					return options;
				},
				bench(opts) {
					return do_not_optimize(generateKey(opts));
				},
			};
		}).args("options", [{ length: 16 }]);

		bench("generateKey() - long (64 chars)", function* (ctx) {
			const options = ctx.get("options");
			yield {
				[0]() {
					return options;
				},
				bench(opts) {
					return do_not_optimize(generateKey(opts));
				},
			};
		}).args("options", [{ length: 64 }]);
	});

	await run();

	// Hashing & Validation
	summary(() => {
		bench("hashKey() - SHA-256", function* (ctx) {
			const key = ctx.get("key");
			yield {
				[0]() {
					return key;
				},
				bench(k) {
					return do_not_optimize(hashKey(k));
				},
			};
		}).args("key", [testKeyString]);

		bench("hashKey() - SHA-512", function* (ctx) {
			const key = ctx.get("key");
			const options = ctx.get("options");
			yield {
				[0]() {
					return key;
				},
				[1]() {
					return options;
				},
				bench(k, opts) {
					return do_not_optimize(hashKey(k, opts));
				},
			};
		})
			.args("key", [testKeyString])
			.args("options", [{ algorithm: "sha512" }]);

		bench("hashKey() - with salt", function* (ctx) {
			const key = ctx.get("key");
			const options = ctx.get("options");
			yield {
				[0]() {
					return key;
				},
				[1]() {
					return options;
				},
				bench(k, opts) {
					return do_not_optimize(hashKey(k, opts));
				},
			};
		})
			.args("key", [testKeyString])
			.args("options", [{ salt: "my-salt" }]);

		bench("validateKey() - matching", function* (ctx) {
			const key = ctx.get("key");
			const hash = ctx.get("hash");
			yield {
				[0]() {
					return key;
				},
				[1]() {
					return hash;
				},
				bench(k, h) {
					return do_not_optimize(validateKey(k, h));
				},
			};
		})
			.args("key", [testKeyString])
			.args("hash", [testKeyHash]);

		bench("validateKey() - non-matching", function* (ctx) {
			const key = ctx.get("key");
			const hash = ctx.get("hash");
			yield {
				[0]() {
					return key;
				},
				[1]() {
					return hash;
				},
				bench(k, h) {
					return do_not_optimize(validateKey(k, h));
				},
			};
		})
			.args("key", ["sk_test_invalid"])
			.args("hash", [testKeyHash]);
	});

	await run();

	// Header Extraction
	summary(() => {
		bench("extractKeyFromHeaders() - Headers object", function* (ctx) {
			const headers = ctx.get("headers");
			yield {
				[0]() {
					return headers;
				},
				bench(h) {
					return do_not_optimize(extractKeyFromHeaders(h));
				},
			};
		}).args("headers", [testHeaders]);

		bench("extractKeyFromHeaders() - plain object", function* (ctx) {
			const headers = ctx.get("headers");
			yield {
				[0]() {
					return headers;
				},
				bench(h) {
					return do_not_optimize(extractKeyFromHeaders(h));
				},
			};
		}).args("headers", [plainHeaders]);

		bench("extractKeyFromHeaders() - with Bearer", function* (ctx) {
			const headers = ctx.get("headers");
			yield {
				[0]() {
					return headers;
				},
				bench(h) {
					return do_not_optimize(extractKeyFromHeaders(h));
				},
			};
		}).args("headers", [{ authorization: `Bearer ${testKeyString}` }]);

		bench("extractKeyFromHeaders() - custom header", function* (ctx) {
			const headers = ctx.get("headers");
			const options = ctx.get("options");
			yield {
				[0]() {
					return headers;
				},
				[1]() {
					return options;
				},
				bench(h, opts) {
					return do_not_optimize(extractKeyFromHeaders(h, opts));
				},
			};
		})
			.args("headers", [{ "x-custom-key": testKeyString }])
			.args("options", [{ headerNames: ["x-custom-key"] }]);

		bench("hasApiKey() - present", function* (ctx) {
			const headers = ctx.get("headers");
			yield {
				[0]() {
					return headers;
				},
				bench(h) {
					return do_not_optimize(hasApiKey(h));
				},
			};
		}).args("headers", [testHeaders]);

		bench("hasApiKey() - missing", function* (ctx) {
			const headers = ctx.get("headers");
			yield {
				[0]() {
					return headers;
				},
				bench(h) {
					return do_not_optimize(hasApiKey(h));
				},
			};
		}).args("headers", [new Headers()]);
	});

	await run();

	// Expiration Checks
	summary(() => {
		bench("isExpired() - future date", function* (ctx) {
			const date = ctx.get("date");
			yield {
				[0]() {
					return date;
				},
				bench(d) {
					return do_not_optimize(isExpired(d));
				},
			};
		}).args("date", [futureDate]);

		bench("isExpired() - past date", function* (ctx) {
			const date = ctx.get("date");
			yield {
				[0]() {
					return date;
				},
				bench(d) {
					return do_not_optimize(isExpired(d));
				},
			};
		}).args("date", [pastDate]);

		bench("isExpired() - null", function* (ctx) {
			const date = ctx.get("date");
			yield {
				[0]() {
					return date;
				},
				bench(d) {
					return do_not_optimize(isExpired(d));
				},
			};
		}).args("date", [null]);

		bench("getExpirationTime() - valid date", function* (ctx) {
			const date = ctx.get("date");
			yield {
				[0]() {
					return date;
				},
				bench(d) {
					return do_not_optimize(getExpirationTime(d));
				},
			};
		}).args("date", [futureDate]);

		bench("getExpirationTime() - null", function* (ctx) {
			const date = ctx.get("date");
			yield {
				[0]() {
					return date;
				},
				bench(d) {
					return do_not_optimize(getExpirationTime(d));
				},
			};
		}).args("date", [null]);
	});

	await run();

	// Scope Checking
	summary(() => {
		bench("hasScope() - found (3 scopes)", function* (ctx) {
			const scopes = ctx.get("scopes");
			const scope = ctx.get("scope");
			yield {
				[0]() {
					return scopes;
				},
				[1]() {
					return scope;
				},
				bench(s, sc) {
					return do_not_optimize(hasScope(s, sc));
				},
			};
		})
			.args("scopes", [testScopes])
			.args("scope", ["read"]);

		bench("hasScope() - not found (3 scopes)", function* (ctx) {
			const scopes = ctx.get("scopes");
			const scope = ctx.get("scope");
			yield {
				[0]() {
					return scopes;
				},
				[1]() {
					return scope;
				},
				bench(s, sc) {
					return do_not_optimize(hasScope(s, sc));
				},
			};
		})
			.args("scopes", [testScopes])
			.args("scope", ["admin"]);

		bench("hasScope() - found (50 scopes)", function* (ctx) {
			const scopes = ctx.get("scopes");
			const scope = ctx.get("scope");
			yield {
				[0]() {
					return scopes;
				},
				[1]() {
					return scope;
				},
				bench(s, sc) {
					return do_not_optimize(hasScope(s, sc));
				},
			};
		})
			.args("scopes", [largeScopes])
			.args("scope", ["scope_25"]);

		bench("hasAnyScope() - first match", function* (ctx) {
			const scopes = ctx.get("scopes");
			const required = ctx.get("required");
			yield {
				[0]() {
					return scopes;
				},
				[1]() {
					return required;
				},
				bench(s, r) {
					return do_not_optimize(hasAnyScope(s, r));
				},
			};
		})
			.args("scopes", [testScopes])
			.args("required", [["read", "admin"]]);

		bench("hasAnyScope() - no match", function* (ctx) {
			const scopes = ctx.get("scopes");
			const required = ctx.get("required");
			yield {
				[0]() {
					return scopes;
				},
				[1]() {
					return required;
				},
				bench(s, r) {
					return do_not_optimize(hasAnyScope(s, r));
				},
			};
		})
			.args("scopes", [testScopes])
			.args("required", [["admin", "super"]]);

		bench("hasAllScopes() - all match", function* (ctx) {
			const scopes = ctx.get("scopes");
			const required = ctx.get("required");
			yield {
				[0]() {
					return scopes;
				},
				[1]() {
					return required;
				},
				bench(s, r) {
					return do_not_optimize(hasAllScopes(s, r));
				},
			};
		})
			.args("scopes", [testScopes])
			.args("required", [["read", "write"]]);

		bench("hasAllScopes() - partial match", function* (ctx) {
			const scopes = ctx.get("scopes");
			const required = ctx.get("required");
			yield {
				[0]() {
					return scopes;
				},
				[1]() {
					return required;
				},
				bench(s, r) {
					return do_not_optimize(hasAllScopes(s, r));
				},
			};
		})
			.args("scopes", [testScopes])
			.args("required", [["read", "admin"]]);
	});

	await run();

	// Resource-based Scope Checking
	summary(() => {
		bench("hasScopeWithResources() - global scope", function* (ctx) {
			const scopes = ctx.get("scopes");
			const resources = ctx.get("resources");
			const scope = ctx.get("scope");
			yield {
				[0]() {
					return scopes;
				},
				[1]() {
					return resources;
				},
				[2]() {
					return scope;
				},
				bench(sc, res, s) {
					return do_not_optimize(hasScopeWithResources(sc, res, s));
				},
			};
		})
			.args("scopes", [testScopes])
			.args("resources", [testResources])
			.args("scope", ["read"]);

		bench("hasScopeWithResources() - resource scope", function* (ctx) {
			const scopes = ctx.get("scopes");
			const resources = ctx.get("resources");
			const scope = ctx.get("scope");
			const options = ctx.get("options");
			yield {
				[0]() {
					return scopes;
				},
				[1]() {
					return resources;
				},
				[2]() {
					return scope;
				},
				[3]() {
					return options;
				},
				bench(sc, res, s, opts) {
					return do_not_optimize(hasScopeWithResources(sc, res, s, opts));
				},
			};
		})
			.args("scopes", [testScopes])
			.args("resources", [testResources])
			.args("scope", ["deploy"])
			.args("options", [{ resource: "project:789" }]);

		bench("hasScopeWithResources() - not found", function* (ctx) {
			const scopes = ctx.get("scopes");
			const resources = ctx.get("resources");
			const scope = ctx.get("scope");
			yield {
				[0]() {
					return scopes;
				},
				[1]() {
					return resources;
				},
				[2]() {
					return scope;
				},
				bench(sc, res, s) {
					return do_not_optimize(hasScopeWithResources(sc, res, s));
				},
			};
		})
			.args("scopes", [testScopes])
			.args("resources", [testResources])
			.args("scope", ["admin"]);

		bench("hasAnyScopeWithResources() - global match", function* (ctx) {
			const scopes = ctx.get("scopes");
			const resources = ctx.get("resources");
			const required = ctx.get("required");
			yield {
				[0]() {
					return scopes;
				},
				[1]() {
					return resources;
				},
				[2]() {
					return required;
				},
				bench(sc, res, req) {
					return do_not_optimize(hasAnyScopeWithResources(sc, res, req));
				},
			};
		})
			.args("scopes", [testScopes])
			.args("resources", [testResources])
			.args("required", [["read", "admin"]]);

		bench("hasAnyScopeWithResources() - resource match", function* (ctx) {
			const scopes = ctx.get("scopes");
			const resources = ctx.get("resources");
			const required = ctx.get("required");
			const options = ctx.get("options");
			yield {
				[0]() {
					return scopes;
				},
				[1]() {
					return resources;
				},
				[2]() {
					return required;
				},
				[3]() {
					return options;
				},
				bench(sc, res, req, opts) {
					return do_not_optimize(hasAnyScopeWithResources(sc, res, req, opts));
				},
			};
		})
			.args("scopes", [[]])
			.args("resources", [testResources])
			.args("required", [["deploy", "admin"]])
			.args("options", [{ resource: "project:789" }]);

		bench("hasAllScopesWithResources() - global match", function* (ctx) {
			const scopes = ctx.get("scopes");
			const resources = ctx.get("resources");
			const required = ctx.get("required");
			yield {
				[0]() {
					return scopes;
				},
				[1]() {
					return resources;
				},
				[2]() {
					return required;
				},
				bench(sc, res, req) {
					return do_not_optimize(hasAllScopesWithResources(sc, res, req));
				},
			};
		})
			.args("scopes", [testScopes])
			.args("resources", [testResources])
			.args("required", [["read", "write"]]);

		bench("hasAllScopesWithResources() - resource match", function* (ctx) {
			const scopes = ctx.get("scopes");
			const resources = ctx.get("resources");
			const required = ctx.get("required");
			const options = ctx.get("options");
			yield {
				[0]() {
					return scopes;
				},
				[1]() {
					return resources;
				},
				[2]() {
					return required;
				},
				[3]() {
					return options;
				},
				bench(sc, res, req, opts) {
					return do_not_optimize(hasAllScopesWithResources(sc, res, req, opts));
				},
			};
		})
			.args("scopes", [[]])
			.args("resources", [testResources])
			.args("required", [["read", "write"]])
			.args("options", [{ resource: "website:123" }]);
	});

	await run();

	// Resource Builder
	summary(() => {
		bench("ResourceBuilder.add() - single", function* (ctx) {
			const type = ctx.get("type");
			const id = ctx.get("id");
			const scopes = ctx.get("scopes");
			yield {
				[0]() {
					return type;
				},
				[1]() {
					return id;
				},
				[2]() {
					return scopes;
				},
				bench(t, i, s) {
					const builder = new ResourceBuilder();
					return do_not_optimize(builder.add(t, i, s));
				},
			};
		})
			.args("type", ["website"])
			.args("id", ["123"])
			.args("scopes", [["read", "write"]])
			.gc("inner");

		bench("ResourceBuilder.addMany() - 10 resources", function* (ctx) {
			const type = ctx.get("type");
			const ids = ctx.get("ids");
			const scopes = ctx.get("scopes");
			yield {
				[0]() {
					return type;
				},
				[1]() {
					return ids;
				},
				[2]() {
					return scopes;
				},
				bench(t, i, s) {
					const builder = new ResourceBuilder();
					return do_not_optimize(builder.addMany(t, i, s));
				},
			};
		})
			.args("type", ["website"])
			.args("ids", [Array.from({ length: 10 }, (_, i) => `site_${i}`)])
			.args("scopes", [["read"]])
			.gc("inner");

		bench("ResourceBuilder.build() - 3 resources", () => {
			const builder = new ResourceBuilder()
				.add("website", "123", ["read", "write"])
				.add("project", "456", ["deploy"])
				.add("team", "789", ["manage"]);
			do_not_optimize(builder.build());
		}).gc("inner");

		bench("ResourceBuilder.has()", function* (ctx) {
			const builder = new ResourceBuilder().add("website", "123", ["read"]);
			const type = ctx.get("type");
			const id = ctx.get("id");
			yield {
				[0]() {
					return type;
				},
				[1]() {
					return id;
				},
				bench(t, i) {
					return do_not_optimize(builder.has(t, i));
				},
			};
		})
			.args("type", ["website"])
			.args("id", ["123"]);

		bench("ResourceBuilder.get()", function* (ctx) {
			const builder = new ResourceBuilder().add("website", "123", ["read"]);
			const type = ctx.get("type");
			const id = ctx.get("id");
			yield {
				[0]() {
					return type;
				},
				[1]() {
					return id;
				},
				bench(t, i) {
					return do_not_optimize(builder.get(t, i));
				},
			};
		})
			.args("type", ["website"])
			.args("id", ["123"]);

		bench("ResourceBuilder.remove()", function* (ctx) {
			const type = ctx.get("type");
			const id = ctx.get("id");
			yield {
				[0]() {
					return type;
				},
				[1]() {
					return id;
				},
				bench(t, i) {
					const builder = new ResourceBuilder().add("website", "123", ["read"]);
					return do_not_optimize(builder.remove(t, i));
				},
			};
		})
			.args("type", ["website"])
			.args("id", ["123"])
			.gc("inner");

		bench("ResourceBuilder.from()", function* (ctx) {
			const resources = ctx.get("resources");
			yield {
				[0]() {
					return resources;
				},
				bench(r) {
					return do_not_optimize(ResourceBuilder.from(r));
				},
			};
		})
			.args("resources", [testResources])
			.gc("inner");
	});

	await run();

	// Cache Operations
	summary(() => {
		bench("MemoryCache.set()", function* (ctx) {
			const key = ctx.get("key");
			const value = ctx.get("value");
			const ttl = ctx.get("ttl");
			yield {
				[0]() {
					return key;
				},
				[1]() {
					return value;
				},
				[2]() {
					return ttl;
				},
				bench(k, v, t) {
					cache.set(k, v, t);
				},
			};
		})
			.args("key", ["test-key"])
			.args("value", ["test-value"])
			.args("ttl", [60]);

		bench("MemoryCache.get() - hit", function* (ctx) {
			cache.set("cached-key", "cached-value", 60);
			const key = ctx.get("key");
			yield {
				[0]() {
					return key;
				},
				bench(k) {
					return do_not_optimize(cache.get(k));
				},
			};
		}).args("key", ["cached-key"]);

		bench("MemoryCache.get() - miss", function* (ctx) {
			const key = ctx.get("key");
			yield {
				[0]() {
					return key;
				},
				bench(k) {
					return do_not_optimize(cache.get(k));
				},
			};
		}).args("key", ["non-existent-key"]);

		bench("MemoryCache.del()", function* (ctx) {
			const key = ctx.get("key");
			yield {
				[0]() {
					return key;
				},
				bench(k) {
					cache.set(k, "value", 60);
					cache.del(k);
				},
			};
		}).args("key", ["delete-key"]);

		bench("MemoryCache.get() - expired", function* (ctx) {
			cache.set("expired-key", "value", -1);
			const key = ctx.get("key");
			yield {
				[0]() {
					return key;
				},
				bench(k) {
					return do_not_optimize(cache.get(k));
				},
			};
		}).args("key", ["expired-key"]);
	});

	await run();

	console.log(`\n${"=".repeat(60)}\n`);
	console.log("🔧 High-Level API Benchmarks\n");

	// Key Generation & Hashing
	summary(() => {
		bench("generateKey()", () => {
			do_not_optimize(keys.generateKey());
		});

		bench("hashKey()", function* (ctx) {
			const key = ctx.get("key");
			yield {
				[0]() {
					return key;
				},
				bench(k) {
					return do_not_optimize(keys.hashKey(k));
				},
			};
		}).args("key", ["sk_test_123456789012345678901234567890"]);

		bench("validateKey()", function* (ctx) {
			const key = ctx.get("key");
			yield {
				[0]() {
					return key;
				},
				bench(k) {
					const hash = keys.hashKey(k);
					return do_not_optimize(keys.validateKey(k, hash));
				},
			};
		}).args("key", ["sk_test_123456789012345678901234567890"]);
	});

	await run();

	if (!testKey) {
		throw new Error("Test key not found");
	}

	// Verification Operations
	summary(() => {
		bench("verify() - valid key (fresh)", async function* (ctx) {
			const key = ctx.get("key");
			const hash = ctx.get("hash");
			yield {
				[0]() {
					return key;
				},
				[1]() {
					return hash;
				},
				async bench(k, h) {
					// Clear cache first to ensure fresh lookup
					await keys.invalidateCache(h);
					const result = await keys.verify(k);
					return do_not_optimize(result);
				},
			};
		})
			.args("key", [testKey])
			.args("hash", [testRecord.keyHash]);

		bench("verify() - valid key (cached)", async function* (ctx) {
			// First verify to populate cache
			await keys.verify(testKey);
			const key = ctx.get("key");
			yield {
				[0]() {
					return key;
				},
				async bench(k) {
					// Then verify again (should hit cache)
					const result = await keys.verify(k);
					return do_not_optimize(result);
				},
			};
		}).args("key", [testKey]);

		bench("verify() - invalid key", async function* (ctx) {
			const key = ctx.get("key");
			yield {
				[0]() {
					return key;
				},
				async bench(k) {
					const result = await keys.verify(k);
					return do_not_optimize(result);
				},
			};
		}).args("key", ["sk_test_invalid_key_that_does_not_exist"]);
	});

	await run();

	// CRUD Operations
	summary(() => {
		bench("create() - single key", async function* (ctx) {
			const options = ctx.get("options");
			yield {
				[0]() {
					return options;
				},
				async bench(opts) {
					const result = await keys.create(opts);
					return do_not_optimize(result);
				},
			};
		})
			.args("options", [
				{ ownerId: "bench_user", name: "Bench Key", scopes: ["read"] },
			])
			.gc("inner");

		bench("findById()", async function* (ctx) {
			const id = ctx.get("id");
			yield {
				[0]() {
					return id;
				},
				async bench(i) {
					const result = await keys.findById(i);
					return do_not_optimize(result);
				},
			};
		}).args("id", [testRecord.id]);

		bench("findByHash()", async function* (ctx) {
			const hash = ctx.get("hash");
			yield {
				[0]() {
					return hash;
				},
				async bench(h) {
					const result = await keys.findByHash(h);
					return do_not_optimize(result);
				},
			};
		}).args("hash", [testRecord.keyHash]);

		bench("list() - single owner", async function* (ctx) {
			const owner = ctx.get("owner");
			yield {
				[0]() {
					return owner;
				},
				async bench(o) {
					const result = await keys.list(o);
					return do_not_optimize(result);
				},
			};
		}).args("owner", ["user_0"]);

		bench("updateLastUsed()", async function* (ctx) {
			const id = ctx.get("id");
			yield {
				[0]() {
					return id;
				},
				async bench(i) {
					await keys.updateLastUsed(i);
				},
			};
		}).args("id", [testRecord.id]);
	});

	await run();

	// Key Management
	summary(() => {
		bench("enable()", async function* (ctx) {
			const id = ctx.get("id");
			yield {
				[0]() {
					return id;
				},
				async bench(i) {
					await keys.enable(i);
				},
			};
		}).args("id", [testRecord.id]);

		bench("disable()", async function* (ctx) {
			const id = ctx.get("id");
			yield {
				[0]() {
					return id;
				},
				async bench(i) {
					await keys.disable(i);
				},
			};
		}).args("id", [testRecord.id]);

		bench("rotate()", async function* (ctx) {
			const options = ctx.get("options");
			yield {
				[0]() {
					return options;
				},
				async bench(opts) {
					const { record } = await keys.create(opts);
					const result = await keys.rotate(record.id);
					return do_not_optimize(result);
				},
			};
		})
			.args("options", [{ ownerId: "rotate_user", name: "Rotate Key" }])
			.gc("inner");
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

		bench("revokeAll() - 10 keys", async function* (ctx) {
			const owner = ctx.get("owner");
			yield {
				[0]() {
					return owner;
				},
				async bench(o) {
					const tempKeys = await Promise.all(
						Array.from({ length: 10 }, (_, i) =>
							keys.create({ ownerId: o, name: `Temp ${i}` })
						)
					);
					await keys.revokeAll(o);
					return do_not_optimize(tempKeys);
				},
			};
		})
			.args("owner", ["temp_user"])
			.gc("inner");
	});

	await run();

	// Header Extraction
	summary(() => {
		bench("extractKey() - Headers object", function* (ctx) {
			const key = ctx.get("key");
			yield {
				[0]() {
					return key;
				},
				bench(k) {
					const headers = new Headers({
						authorization: `Bearer ${k}`,
					});
					return do_not_optimize(keys.extractKey(headers));
				},
			};
		})
			.args("key", [testKey])
			.gc("inner");

		bench("extractKey() - plain object", function* (ctx) {
			const key = ctx.get("key");
			yield {
				[0]() {
					return key;
				},
				bench(k) {
					const headers = {
						"x-api-key": k,
					};
					return do_not_optimize(keys.extractKey(headers));
				},
			};
		}).args("key", [testKey]);

		bench("hasKey()", function* (ctx) {
			const key = ctx.get("key");
			yield {
				[0]() {
					return key;
				},
				bench(k) {
					const headers = new Headers({
						authorization: `Bearer ${k}`,
					});
					return do_not_optimize(keys.hasKey(headers));
				},
			};
		})
			.args("key", [testKey])
			.gc("inner");
	});

	await run();

	// Storage Layer
	summary(() => {
		bench("storage.save()", async function* (ctx) {
			const options = ctx.get("options");
			yield {
				[0]() {
					return options;
				},
				async bench(opts) {
					const { record } = await keys.create(opts);
					await memoryStorage.save(record);
					return do_not_optimize(record);
				},
			};
		})
			.args("options", [{ ownerId: "storage_user", name: "Storage Key" }])
			.gc("inner");

		bench("storage.findByHash()", async function* (ctx) {
			const hash = ctx.get("hash");
			yield {
				[0]() {
					return hash;
				},
				async bench(h) {
					const result = await memoryStorage.findByHash(h);
					return do_not_optimize(result);
				},
			};
		}).args("hash", [testRecord.keyHash]);

		bench("storage.findByOwner()", async function* (ctx) {
			const owner = ctx.get("owner");
			yield {
				[0]() {
					return owner;
				},
				async bench(o) {
					const result = await memoryStorage.findByOwner(o);
					return do_not_optimize(result);
				},
			};
		}).args("owner", ["user_0"]);

		bench("storage.updateMetadata()", async function* (ctx) {
			const id = ctx.get("id");
			const metadata = ctx.get("metadata");
			yield {
				[0]() {
					return id;
				},
				[1]() {
					return metadata;
				},
				async bench(i, m) {
					await memoryStorage.updateMetadata(i, m);
				},
			};
		})
			.args("id", [testRecord.id])
			.args("metadata", [{ lastUsedAt: new Date().toISOString() }]);
	});

	await run();

	console.log("\n✨ Benchmark complete!");
}

main().catch(console.error);
