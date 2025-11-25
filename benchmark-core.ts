/** biome-ignore-all lint/suspicious/noConsole: benchmarking */
/** biome-ignore-all lint/style/noMagicNumbers: benchmarking */
import chalk from "chalk";
import { nanoid } from "nanoid";
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
import { MemoryStore } from "./src/storage/memory";
import type { ApiKeyRecord } from "./src/types/api-key-types";
import type { AuditLog } from "./src/types/audit-log-types";
import type { PermissionScope } from "./src/types/permissions-types";

type BenchResult = {
	name: string;
	opsPerSec: number;
	avgNs: number;
};

type BenchGroup = {
	title: string;
	icon: string;
	results: BenchResult[];
};

const fmt = {
	num: (n: number): string => {
		if (n >= 1_000_000) {
			return `${(n / 1_000_000).toFixed(2)}M`;
		}
		if (n >= 1000) {
			return `${(n / 1000).toFixed(2)}K`;
		}
		return n.toFixed(0);
	},
	time: (ns: number): string => {
		if (ns >= 1_000_000) {
			return `${(ns / 1_000_000).toFixed(2)} ms`;
		}
		if (ns >= 1000) {
			return `${(ns / 1000).toFixed(2)} µs`;
		}
		return `${ns.toFixed(2)} ns`;
	},
};

function bench(
	name: string,
	fn: () => void,
	iterations = 100_000
): BenchResult {
	// Warmup
	for (let i = 0; i < 1000; i++) {
		fn();
	}

	const times: number[] = [];
	for (let i = 0; i < iterations; i++) {
		const start = performance.now();
		fn();
		const end = performance.now();
		times.push((end - start) * 1_000_000); // to ns
	}

	const avgNs = times.reduce((a, b) => a + b, 0) / iterations;
	const opsPerSec = 1_000_000_000 / avgNs;

	return { name, opsPerSec, avgNs };
}

async function benchAsync(
	name: string,
	fn: () => Promise<unknown>,
	iterations = 10_000
): Promise<BenchResult> {
	// Warmup
	for (let i = 0; i < 100; i++) {
		await fn();
	}

	const times: number[] = [];
	for (let i = 0; i < iterations; i++) {
		const start = performance.now();
		await fn();
		const end = performance.now();
		times.push((end - start) * 1_000_000); // to ns
	}

	const avgNs = times.reduce((a, b) => a + b, 0) / iterations;
	const opsPerSec = 1_000_000_000 / avgNs;

	return { name, opsPerSec, avgNs };
}

function printGroup(group: BenchGroup) {
	console.log(`\n${group.icon}  ${chalk.bold.white(group.title)}`);
	console.log(chalk.dim("─".repeat(80)));

	for (const r of group.results) {
		const ops = chalk.cyan.bold(fmt.num(r.opsPerSec).padStart(10));
		const time = chalk.dim(fmt.time(r.avgNs).padStart(12));
		console.log(`  ${ops} ops/sec  ${time}  ${chalk.white(r.name)}`);
	}
}

async function main() {
	console.log(chalk.bold.magenta("\n⚡ Core Performance Benchmarks\n"));

	// ============================================================
	// Setup test data
	// ============================================================
	const key = "sk_test_abcdef1234567890ABCDEF1234567890";
	const keyHash = hashKey(key);
	const scopes: PermissionScope[] = ["read", "write", "delete"];
	const largeScopes: PermissionScope[] = Array.from(
		{ length: 50 },
		(_, i) => `scope_${i}` as PermissionScope
	);
	const resources = {
		"website:123": ["read", "write"] as PermissionScope[],
		"project:789": ["deploy", "manage"] as PermissionScope[],
	};
	const headers = new Headers({ authorization: `Bearer ${key}` });
	const plainHeaders = { "x-api-key": key };
	const futureDate = new Date(Date.now() + 86_400_000).toISOString();
	const pastDate = new Date(Date.now() - 86_400_000).toISOString();
	const cache = new MemoryCache();
	cache.set("cached-key", "value", 60);

	// Setup storage with test data for tag/delete benchmarks
	const storage = new MemoryStore();
	const testRecords: ApiKeyRecord[] = [];

	console.log(chalk.dim("Setting up test data..."));

	for (let i = 0; i < 100; i++) {
		const record: ApiKeyRecord = {
			id: nanoid(),
			keyHash: hashKey(`sk_test_${i}_${nanoid()}`),
			metadata: {
				ownerId: `user_${i % 10}`,
				name: `Test Key ${i}`,
				scopes: ["read", "write"],
				tags: [`env:${i % 2 === 0 ? "prod" : "dev"}`, `team:${i % 5}`],
				createdAt: new Date().toISOString(),
				expiresAt: null,
				revokedAt: null,
				enabled: true,
				rotatedTo: null,
			},
		};
		await storage.save(record);
		testRecords.push(record);
	}

	// Create audit logs for benchmarking
	const auditLogs: AuditLog[] = [];
	for (let i = 0; i < 500; i++) {
		const log: AuditLog = {
			id: nanoid(),
			action: ["created", "revoked", "rotated", "enabled", "disabled"][
				i % 5
			] as AuditLog["action"],
			keyId: testRecords[i % 100]?.id ?? nanoid(),
			ownerId: `user_${i % 10}`,
			timestamp: new Date(Date.now() - i * 60000).toISOString(),
			data: { ip: "127.0.0.1", userAgent: "benchmark" },
		};
		await storage.saveLog(log);
		auditLogs.push(log);
	}

	console.log(chalk.dim("Setup complete.\n"));

	const groups: BenchGroup[] = [
		{
			title: "Key Generation",
			icon: "🔑",
			results: [
				bench("16 chars", () => generateKey({ length: 16 })),
				bench("32 chars", () => generateKey({ length: 32 })),
				bench("64 chars", () => generateKey({ length: 64 })),
				bench("with prefix", () => generateKey({ prefix: "sk_", length: 32 })),
			],
		},
		{
			title: "Cryptographic Hashing",
			icon: "🔒",
			results: [
				bench("SHA-256", () => hashKey(key)),
				bench("SHA-512", () => hashKey(key, { algorithm: "sha512" })),
				bench("with salt", () => hashKey(key, { salt: "secret" })),
				bench("validate match", () => validateKey(key, keyHash)),
				bench("validate no match", () => validateKey("invalid", keyHash)),
			],
		},
		{
			title: "Header Extraction",
			icon: "📋",
			results: [
				bench("Headers object", () => extractKeyFromHeaders(headers)),
				bench("plain object", () => extractKeyFromHeaders(plainHeaders)),
				bench("Bearer token", () =>
					extractKeyFromHeaders({ authorization: `Bearer ${key}` })
				),
				bench("hasApiKey (present)", () => hasApiKey(headers)),
				bench("hasApiKey (missing)", () => hasApiKey(new Headers())),
			],
		},
		{
			title: "Expiration Checks",
			icon: "⏰",
			results: [
				bench("future date", () => isExpired(futureDate)),
				bench("past date", () => isExpired(pastDate)),
				bench("null check", () => isExpired(null)),
				bench("get expiration (valid)", () => getExpirationTime(futureDate)),
				bench("get expiration (null)", () => getExpirationTime(null)),
			],
		},
		{
			title: "Permission Scopes (3 scopes)",
			icon: "🔐",
			results: [
				bench("hasScope (found)", () => hasScope(scopes, "read")),
				bench("hasScope (not found)", () =>
					hasScope(scopes, "admin" as PermissionScope)
				),
				bench("hasAnyScope (match)", () =>
					hasAnyScope(scopes, ["read", "admin"] as PermissionScope[])
				),
				bench("hasAnyScope (no match)", () =>
					hasAnyScope(scopes, ["admin", "super"] as PermissionScope[])
				),
				bench("hasAllScopes (match)", () =>
					hasAllScopes(scopes, ["read", "write"])
				),
				bench("hasAllScopes (partial)", () =>
					hasAllScopes(scopes, ["read", "admin"] as PermissionScope[])
				),
			],
		},
		{
			title: "Permission Scopes (50 scopes)",
			icon: "🔐",
			results: [
				bench("hasScope (middle)", () =>
					hasScope(largeScopes, "scope_25" as PermissionScope)
				),
				bench("hasScope (last)", () =>
					hasScope(largeScopes, "scope_49" as PermissionScope)
				),
			],
		},
		{
			title: "Resource-Scoped Permissions",
			icon: "🌐",
			results: [
				bench("hasScopeWithResources (global)", () =>
					hasScopeWithResources(scopes, resources, "read")
				),
				bench("hasScopeWithResources (resource)", () =>
					hasScopeWithResources(scopes, resources, "deploy", {
						resource: "project:789",
					})
				),
				bench("hasAnyScopeWithResources (global)", () =>
					hasAnyScopeWithResources(scopes, resources, [
						"read",
						"admin",
					] as PermissionScope[])
				),
				bench("hasAnyScopeWithResources (resource)", () =>
					hasAnyScopeWithResources(
						[],
						resources,
						["deploy", "admin"] as PermissionScope[],
						{ resource: "project:789" }
					)
				),
				bench("hasAllScopesWithResources (global)", () =>
					hasAllScopesWithResources(scopes, resources, ["read", "write"])
				),
				bench("hasAllScopesWithResources (resource)", () =>
					hasAllScopesWithResources([], resources, ["read", "write"], {
						resource: "website:123",
					})
				),
			],
		},
		{
			title: "Resource Builder",
			icon: "🏗️",
			results: [
				bench("add single", () =>
					new ResourceBuilder().add("website", "123", ["read"])
				),
				bench("add 10 resources", () => {
					const b = new ResourceBuilder();
					const ids = Array.from({ length: 10 }, (_, i) => `site_${i}`);
					b.addMany("website", ids, ["read"]);
				}),
				bench("build (3 resources)", () =>
					new ResourceBuilder()
						.add("website", "123", ["read"])
						.add("project", "456", ["deploy"])
						.add("team", "789", ["manage"])
						.build()
				),
				bench("has", () =>
					new ResourceBuilder()
						.add("website", "123", ["read"])
						.has("website", "123")
				),
				bench("get", () =>
					new ResourceBuilder()
						.add("website", "123", ["read"])
						.get("website", "123")
				),
				bench("from existing", () => ResourceBuilder.from(resources)),
			],
		},
		{
			title: "Memory Cache",
			icon: "💾",
			results: [
				bench("set", () => cache.set("key", "value", 60)),
				bench("get (hit)", () => cache.get("cached-key")),
				bench("get (miss)", () => cache.get("missing")),
				bench("del", () => {
					cache.set("temp", "val", 60);
					cache.del("temp");
				}),
			],
		},
	];

	// Async benchmarks need separate handling
	const asyncGroups: BenchGroup[] = [];

	// Storage: Tag-based Lookups
	const tagResults: BenchResult[] = [];
	tagResults.push(await benchAsync("findByTag (single)", () => storage.findByTag("env:prod")));
	tagResults.push(await benchAsync("findByTag (with owner)", () => storage.findByTag("env:prod", "user_0")));
	tagResults.push(await benchAsync("findByTags (multiple)", () => storage.findByTags(["env:prod", "team:1"])));
	tagResults.push(await benchAsync("findByTags (with owner)", () => storage.findByTags(["env:prod", "team:1"], "user_0")));
	asyncGroups.push({ title: "Tag-based Lookups", icon: "🏷️", results: tagResults });

	// Storage: Core Operations
	const storageResults: BenchResult[] = [];
	storageResults.push(await benchAsync("findById", () => storage.findById(testRecords[0]?.id ?? nanoid())));
	storageResults.push(await benchAsync("findByHash", () => storage.findByHash(testRecords[0]?.keyHash ?? nanoid())));
	storageResults.push(await benchAsync("findByOwner", () => storage.findByOwner("user_0")));
	storageResults.push(await benchAsync("updateMetadata", () => storage.updateMetadata(testRecords[0]?.id ?? nanoid(), { lastUsedAt: new Date().toISOString() })));
	asyncGroups.push({ title: "Storage Core Operations", icon: "📦", results: storageResults });

	// Storage: Delete Operations
	const deleteResults: BenchResult[] = [];
	let deleteCounter = 0;
	deleteResults.push(await benchAsync("delete (single)", async () => {
		const record: ApiKeyRecord = {
			id: `delete_${deleteCounter++}`,
			keyHash: hashKey(`delete_key_${deleteCounter}`),
			metadata: {
				ownerId: "delete_user",
				name: "Delete Test",
				createdAt: new Date().toISOString(),
				expiresAt: null,
				revokedAt: null,
				enabled: true,
				rotatedTo: null,
			},
		};
		await storage.save(record);
		await storage.delete(record.id);
	}, 10_000));
	asyncGroups.push({ title: "Storage Delete Operations", icon: "🗑️", results: deleteResults });

	// Audit Log Operations
	const auditResults: BenchResult[] = [];
	auditResults.push(await benchAsync("saveLog", async () => {
		const log: AuditLog = {
			id: nanoid(),
			action: "created",
			keyId: testRecords[0]?.id ?? nanoid(),
			ownerId: "user_0",
			timestamp: new Date().toISOString(),
		};
		await storage.saveLog(log);
	}, 10_000));
	auditResults.push(await benchAsync("findLogs (no filter)", () => storage.findLogs({})));
	auditResults.push(await benchAsync("findLogs (by keyId)", () => storage.findLogs({ keyId: testRecords[0]?.id ?? nanoid() })));
	auditResults.push(await benchAsync("findLogs (by ownerId)", () => storage.findLogs({ ownerId: "user_0" })));
	auditResults.push(await benchAsync("findLogs (by action)", () => storage.findLogs({ action: "created" })));
	auditResults.push(await benchAsync("findLogs (date range)", () => storage.findLogs({
		startDate: new Date(Date.now() - 3600000).toISOString(),
		endDate: new Date().toISOString(),
	})));
	auditResults.push(await benchAsync("countLogs", () => storage.countLogs({ ownerId: "user_0" })));
	auditResults.push(await benchAsync("getLogStats", () => storage.getLogStats("user_0")));
	asyncGroups.push({ title: "Audit Log Operations", icon: "📋", results: auditResults });

	// Concurrency Tests
	const concurrencyResults: BenchResult[] = [];
	concurrencyResults.push(await benchAsync("10 concurrent findById", async () => {
		const ids = testRecords.slice(0, 10).map(r => r.id);
		await Promise.all(ids.map(id => storage.findById(id)));
	}, 5_000));
	concurrencyResults.push(await benchAsync("50 concurrent findById", async () => {
		const ids = testRecords.slice(0, 50).map(r => r.id);
		await Promise.all(ids.map(id => storage.findById(id)));
	}, 1_000));
	concurrencyResults.push(await benchAsync("100 concurrent findById", async () => {
		await Promise.all(testRecords.map(r => storage.findById(r.id)));
	}, 500));
	concurrencyResults.push(await benchAsync("50 concurrent findByHash", async () => {
		const hashes = testRecords.slice(0, 50).map(r => r.keyHash);
		await Promise.all(hashes.map(h => storage.findByHash(h)));
	}, 1_000));
	concurrencyResults.push(await benchAsync("mixed operations (50 concurrent)", async () => {
		const ops = Array.from({ length: 50 }, (_, i) => {
			const record = testRecords[i % 100];
			const op = i % 4;
			if (op === 0) return storage.findById(record?.id ?? "");
			if (op === 1) return storage.findByHash(record?.keyHash ?? "");
			if (op === 2) return storage.findByOwner(`user_${i % 10}`);
			return storage.findByTag("env:prod");
		});
		await Promise.all(ops);
	}, 1_000));
	asyncGroups.push({ title: "Concurrency Stress Tests", icon: "⚡", results: concurrencyResults });

	// Print sync benchmarks
	console.log(chalk.bold.cyan("\n━━━ Synchronous Operations ━━━"));
	for (const group of groups) {
		printGroup(group);
	}

	// Print async benchmarks
	console.log(chalk.bold.cyan("\n━━━ Asynchronous Operations ━━━"));
	for (const group of asyncGroups) {
		printGroup(group);
	}

	// Summary
	const allResults = [...groups, ...asyncGroups].flatMap((g) => g.results);
	const fastest = allResults.reduce((a, b) =>
		a.opsPerSec > b.opsPerSec ? a : b
	);
	const slowest = allResults.reduce((a, b) =>
		a.opsPerSec < b.opsPerSec ? a : b
	);

	console.log(chalk.bold.yellow("\n📊 Summary"));
	console.log(chalk.dim("─".repeat(80)));
	console.log(
		`  ${chalk.green("🏆 Fastest:")} ${chalk.white(fastest.name)} ${chalk.cyan(`(${fmt.num(fastest.opsPerSec)} ops/sec)`)}`
	);
	console.log(
		`  ${chalk.red("🐌 Slowest:")} ${chalk.white(slowest.name)} ${chalk.cyan(`(${fmt.num(slowest.opsPerSec)} ops/sec)`)}`
	);
	console.log(
		`  ${chalk.magenta("⚡ Ratio:")} ${chalk.white(`${(fastest.opsPerSec / slowest.opsPerSec).toFixed(1)}x faster`)}\n`
	);
}

main().catch(console.error);
