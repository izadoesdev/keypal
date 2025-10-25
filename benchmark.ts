/** biome-ignore-all lint/suspicious/noConsole: benchmarking */
/** biome-ignore-all lint/style/noMagicNumbers: benchmarking */
/** biome-ignore-all lint/suspicious/noExplicitAny: benchmarking */
import { bench, do_not_optimize, run, summary } from "mitata";
import { createKeys } from "./src/manager";
import { MemoryStore } from "./src/storage/memory";

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

async function main() {
	console.log("🚀 Running benchmarks...\n");

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
