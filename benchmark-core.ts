/** biome-ignore-all lint/suspicious/noConsole: benchmarking */
/** biome-ignore-all lint/style/noMagicNumbers: benchmarking */
import chalk from "chalk";
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

function printGroup(group: BenchGroup) {
	console.log(`\n${group.icon}  ${chalk.bold.white(group.title)}`);
	console.log(chalk.dim("─".repeat(80)));

	for (const r of group.results) {
		const ops = chalk.cyan.bold(fmt.num(r.opsPerSec).padStart(10));
		const time = chalk.dim(fmt.time(r.avgNs).padStart(12));
		console.log(`  ${ops} ops/sec  ${time}  ${chalk.white(r.name)}`);
	}
}

function main() {
	console.log(chalk.bold.magenta("\n⚡ Core Performance Benchmarks\n"));

	// Setup
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

	for (const group of groups) {
		printGroup(group);
	}

	// Summary
	const allResults = groups.flatMap((g) => g.results);
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

main();
