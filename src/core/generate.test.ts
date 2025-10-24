import { describe, expect, it } from "vitest";
import { generateKey } from "./generate";

describe("generateKey", () => {
	it("should generate a key with default length", () => {
		const key = generateKey();
		expect(key).toBeDefined();
		expect(typeof key).toBe("string");
		expect(key.length).toBeGreaterThan(0);
	});

	it("should generate a key with custom length", () => {
		const key = generateKey({ length: 16 });
		expect(key).toBeDefined();
		expect(key.length).toBeGreaterThan(0);
	});

	it("should generate a key with prefix", () => {
		const prefix = "sk_live_";
		const key = generateKey({ prefix });
		expect(key.startsWith(prefix)).toBe(true);
	});

	it("should generate a key with prefix and custom length", () => {
		const prefix = "pk_test_";
		const key = generateKey({ prefix, length: 24 });
		expect(key.startsWith(prefix)).toBe(true);
		expect(key.length).toBeGreaterThan(prefix.length);
	});

	it("should generate unique keys", () => {
		const key1 = generateKey();
		const key2 = generateKey();
		expect(key1).not.toBe(key2);
	});

	it("should generate different keys even with same config", () => {
		const config = { prefix: "test_", length: 32 };
		const key1 = generateKey(config);
		const key2 = generateKey(config);
		expect(key1).not.toBe(key2);
	});

	it("should generate a key without prefix", () => {
		const key = generateKey({ prefix: "" });
		expect(key).toBeDefined();
		expect(key.length).toBeGreaterThan(0);
	});

	it("should handle very short keys", () => {
		const key = generateKey({ length: 1 });
		expect(key).toBeDefined();
		expect(key.length).toBeGreaterThan(0);
	});

	it("should handle very long keys", () => {
		const key = generateKey({ length: 256 });
		expect(key).toBeDefined();
		expect(key.length).toBeGreaterThan(0);
	});

	it("should generate keys with different prefixes", () => {
		const key1 = generateKey({ prefix: "prefix1_" });
		const key2 = generateKey({ prefix: "prefix2_" });
		expect(key1.startsWith("prefix1_")).toBe(true);
		expect(key2.startsWith("prefix2_")).toBe(true);
	});
});
