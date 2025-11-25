/**
 * Storage Backend Comparison Benchmarks
 *
 * Compares performance across different storage adapters:
 * - MemoryStore (baseline)
 * - Redis (if REDIS_URL is set)
 * - Drizzle with SQLite (if available)
 *
 * Run: bun run benchmark-storage.ts
 *
 * Environment variables:
 *   REDIS_URL - Redis connection URL (optional)
 *   DATABASE_URL - PostgreSQL/SQLite connection URL (optional)
 */
// @ts-nocheck
/** biome-ignore-all lint/suspicious/noConsole: benchmarking */
/** biome-ignore-all lint/style/noMagicNumbers: benchmarking */
import chalk from "chalk";
import { nanoid } from "nanoid";
import { hashKey } from "./src/core/hash";
import { MemoryStore } from "./src/storage/memory";
import type { ApiKeyRecord } from "./src/types/api-key-types";
import type { AuditLog } from "./src/types/audit-log-types";
import type { Storage } from "./src/types/storage-types";

type BenchResult = {
	name: string;
	opsPerSec: number;
	avgNs: number;
};

type StorageResults = {
	storageName: string;
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

async function benchAsync(
	name: string,
	fn: () => Promise<unknown>,
	iterations = 1_000
): Promise<BenchResult> {
	// Warmup
	for (let i = 0; i < 50; i++) {
		await fn();
	}

	const times: number[] = [];
	for (let i = 0; i < iterations; i++) {
		const start = performance.now();
		await fn();
		const end = performance.now();
		times.push((end - start) * 1_000_000);
	}

	const avgNs = times.reduce((a, b) => a + b, 0) / iterations;
	const opsPerSec = 1_000_000_000 / avgNs;

	return { name, opsPerSec, avgNs };
}

function createTestRecords(count: number): ApiKeyRecord[] {
	return Array.from({ length: count }, (_, i) => ({
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
	}));
}

async function setupStorage(storage: Storage, records: ApiKeyRecord[]): Promise<void> {
	for (const record of records) {
		await storage.save(record);
	}

	// Create some audit logs
	for (let i = 0; i < 100; i++) {
		const log: AuditLog = {
			id: nanoid(),
			action: ["created", "revoked", "rotated", "enabled", "disabled"][i % 5] as AuditLog["action"],
			keyId: records[i % records.length]?.id ?? nanoid(),
			ownerId: `user_${i % 10}`,
			timestamp: new Date(Date.now() - i * 60000).toISOString(),
		};
		await storage.saveLog?.(log);
	}
}

async function benchStorage(
	storageName: string,
	storage: Storage,
	records: ApiKeyRecord[]
): Promise<StorageResults> {
	console.log(chalk.dim(`  Benchmarking ${storageName}...`));

	const results: BenchResult[] = [];
	const testRecord = records[0];

	if (!testRecord) {
		throw new Error("No test records available");
	}

	// Core Operations
	results.push(await benchAsync("findById", () => storage.findById(testRecord.id)));
	results.push(await benchAsync("findByHash", () => storage.findByHash(testRecord.keyHash)));
	results.push(await benchAsync("findByOwner", () => storage.findByOwner("user_0")));

	// Tag Operations
	results.push(await benchAsync("findByTag", () => storage.findByTag("env:prod")));
	results.push(await benchAsync("findByTags", () => storage.findByTags(["env:prod", "team:1"])));
	results.push(await benchAsync("findByTag (with owner)", () => storage.findByTag("env:prod", "user_0")));

	// Update Operations
	results.push(await benchAsync("updateMetadata", () =>
		storage.updateMetadata(testRecord.id, { lastUsedAt: new Date().toISOString() })
	));

	// Save Operation (create new records)
	let saveCounter = 0;
	results.push(await benchAsync("save (new)", async () => {
		const newRecord: ApiKeyRecord = {
			id: `bench_save_${saveCounter++}`,
			keyHash: hashKey(`save_key_${saveCounter}`),
			metadata: {
				ownerId: "bench_user",
				name: "Bench Save",
				createdAt: new Date().toISOString(),
				expiresAt: null,
				revokedAt: null,
				enabled: true,
				rotatedTo: null,
			},
		};
		await storage.save(newRecord);
	}, 500));

	// Delete Operation
	let deleteCounter = 0;
	results.push(await benchAsync("delete", async () => {
		const record: ApiKeyRecord = {
			id: `bench_delete_${deleteCounter++}`,
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
	}, 500));

	// Audit Log Operations (if supported)
	if (storage.findLogs) {
		results.push(await benchAsync("findLogs", () => storage.findLogs!({})));
		results.push(await benchAsync("findLogs (filtered)", () => storage.findLogs!({ ownerId: "user_0" })));
	}
	if (storage.countLogs) {
		results.push(await benchAsync("countLogs", () => storage.countLogs!({ ownerId: "user_0" })));
	}

	// Concurrency Tests
	results.push(await benchAsync("10 concurrent findById", async () => {
		await Promise.all(records.slice(0, 10).map(r => storage.findById(r.id)));
	}, 500));
	results.push(await benchAsync("50 concurrent findById", async () => {
		await Promise.all(records.slice(0, 50).map(r => storage.findById(r.id)));
	}, 200));

	return { storageName, results };
}

function printComparisonTable(allResults: StorageResults[]): void {
	console.log(chalk.bold.yellow("\n📊 Storage Comparison Summary"));
	console.log(chalk.dim("─".repeat(100)));

	// Get all unique operation names
	const operations = [...new Set(allResults.flatMap(r => r.results.map(b => b.name)))];

	// Header
	const storageNames = allResults.map(r => r.storageName);
	const headerRow = ["Operation", ...storageNames.map(n => n.padStart(15))].join(" │ ");
	console.log(chalk.bold(headerRow));
	console.log(chalk.dim("─".repeat(100)));

	// Data rows
	for (const op of operations) {
		const values = allResults.map(storage => {
			const result = storage.results.find(r => r.name === op);
			return result ? fmt.num(result.opsPerSec) : "N/A";
		});

		// Find fastest for this operation
		const numericValues = allResults.map(storage => {
			const result = storage.results.find(r => r.name === op);
			return result?.opsPerSec ?? 0;
		});
		const maxIdx = numericValues.indexOf(Math.max(...numericValues));

		const formattedValues = values.map((v, i) =>
			i === maxIdx ? chalk.green.bold(v.padStart(15)) : v.padStart(15)
		);

		const row = [op.padEnd(25), ...formattedValues].join(" │ ");
		console.log(row);
	}

	console.log(chalk.dim("─".repeat(100)));
	console.log(chalk.dim("  (Higher ops/sec is better. Fastest highlighted in green.)"));
}

async function main() {
	console.log(chalk.bold.magenta("\n⚡ Storage Backend Comparison Benchmarks\n"));

	const testRecords = createTestRecords(100);
	const allResults: StorageResults[] = [];

	// ============================================================
	// MemoryStore (baseline)
	// ============================================================
	console.log(chalk.bold.cyan("📦 MemoryStore"));
	const memoryStorage = new MemoryStore();
	await setupStorage(memoryStorage, testRecords);
	const memoryResults = await benchStorage("MemoryStore", memoryStorage, testRecords);
	allResults.push(memoryResults);

	// ============================================================
	// Redis (optional)
	// ============================================================
	const redisUrl = process.env.REDIS_URL;
	if (redisUrl) {
		console.log(chalk.bold.cyan("\n📦 RedisStore"));
		try {
			const { Redis } = await import("ioredis");
			const { RedisStore } = await import("./src/storage/redis");

			const redis = new Redis(redisUrl);
			await redis.flushdb(); // Clear test data

			const redisStorage = new RedisStore({ client: redis });
			await setupStorage(redisStorage, testRecords);
			const redisResults = await benchStorage("RedisStore", redisStorage, testRecords);
			allResults.push(redisResults);

			await redis.quit();
		} catch (error) {
			console.log(chalk.yellow(`  ⚠ Redis not available: ${error}`));
		}
	} else {
		console.log(chalk.dim("\n📦 RedisStore - Skipped (set REDIS_URL to enable)"));
	}

	// ============================================================
	// Drizzle with SQLite (optional)
	// ============================================================
	const databaseUrl = process.env.DATABASE_URL;
	if (databaseUrl?.includes("sqlite")) {
		console.log(chalk.bold.cyan("\n📦 DrizzleStore (SQLite)"));
		try {
			const { drizzle } = await import("drizzle-orm/better-sqlite3");
			const Database = (await import("better-sqlite3")).default;
			const { DrizzleStore } = await import("./src/storage/drizzle");
			const { apikey } = await import("./src/drizzle/schema");

			const sqlite = new Database(":memory:");
			const db = drizzle(sqlite);

			// Create tables
			sqlite.exec(`
				CREATE TABLE IF NOT EXISTS apikey (
					id TEXT PRIMARY KEY,
					key_hash TEXT NOT NULL UNIQUE,
					metadata TEXT NOT NULL
				);
				CREATE TABLE IF NOT EXISTS audit_log (
					id TEXT PRIMARY KEY,
					action TEXT NOT NULL,
					key_id TEXT NOT NULL,
					owner_id TEXT NOT NULL,
					timestamp TEXT NOT NULL,
					data TEXT
				);
				CREATE INDEX IF NOT EXISTS idx_apikey_key_hash ON apikey(key_hash);
				CREATE INDEX IF NOT EXISTS idx_audit_log_key_id ON audit_log(key_id);
				CREATE INDEX IF NOT EXISTS idx_audit_log_owner_id ON audit_log(owner_id);
			`);

			const drizzleStorage = new DrizzleStore({ db, table: apikey });
			await setupStorage(drizzleStorage, testRecords);
			const drizzleResults = await benchStorage("DrizzleStore", drizzleStorage, testRecords);
			allResults.push(drizzleResults);

			sqlite.close();
		} catch (error) {
			console.log(chalk.yellow(`  ⚠ Drizzle/SQLite not available: ${error}`));
		}
	} else {
		console.log(chalk.dim("\n📦 DrizzleStore - Skipped (set DATABASE_URL=sqlite:... to enable)"));
	}

	// ============================================================
	// Print Results
	// ============================================================
	if (allResults.length === 1) {
		console.log(chalk.bold.yellow("\n📊 Results (MemoryStore only)"));
		console.log(chalk.dim("─".repeat(80)));
		for (const result of allResults[0]?.results ?? []) {
			const ops = chalk.cyan.bold(fmt.num(result.opsPerSec).padStart(10));
			const time = chalk.dim(fmt.time(result.avgNs).padStart(12));
			console.log(`  ${ops} ops/sec  ${time}  ${chalk.white(result.name)}`);
		}
	} else {
		printComparisonTable(allResults);
	}

	// ============================================================
	// Summary
	// ============================================================
	console.log(chalk.bold.yellow("\n📈 Key Insights"));
	console.log(chalk.dim("─".repeat(80)));

	for (const storage of allResults) {
		const results = storage.results;
		const fastest = results.reduce((a, b) => (a.opsPerSec > b.opsPerSec ? a : b));
		const slowest = results.reduce((a, b) => (a.opsPerSec < b.opsPerSec ? a : b));

		console.log(`\n  ${chalk.bold(storage.storageName)}:`);
		console.log(`    🏆 Fastest: ${chalk.green(fastest.name)} (${fmt.num(fastest.opsPerSec)} ops/sec)`);
		console.log(`    🐌 Slowest: ${chalk.red(slowest.name)} (${fmt.num(slowest.opsPerSec)} ops/sec)`);
		console.log(`    ⚡ Ratio: ${(fastest.opsPerSec / slowest.opsPerSec).toFixed(1)}x`);
	}

	console.log(chalk.bold.green("\n✨ Storage benchmark complete!\n"));
}

main().catch(console.error);

