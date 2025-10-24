import { describe, expect, it } from "vitest";
import { hashKey } from "./hash";

describe("hashKey", () => {
  it("should hash a key with default algorithm (sha256)", () => {
    const key = "test-key-123";
    const hash = hashKey(key);

    expect(hash).toBeDefined();
    // biome-ignore lint/style/noMagicNumbers: 64 characters default
    expect(hash.length).toBe(64);
  });

  it("should hash a key with sha256 explicitly", () => {
    const key = "test-key-123";
    const hash = hashKey(key, { algorithm: "sha256" });

    expect(hash).toBeDefined();
    // biome-ignore lint/style/noMagicNumbers: 64 characters default
    expect(hash.length).toBe(64);
  });

  it("should hash a key with sha512", () => {
    const key = "test-key-123";
    const hash = hashKey(key, { algorithm: "sha512" });

    expect(hash).toBeDefined();
    // biome-ignore lint/style/noMagicNumbers: 128 characters default
    expect(hash.length).toBe(128);
  });

  it("should produce consistent hashes for same input", () => {
    const key = "test-key-123";
    const hash1 = hashKey(key);
    const hash2 = hashKey(key);

    expect(hash1).toBe(hash2);
  });

  it("should produce different hashes for different inputs", () => {
    const key1 = "test-key-123";
    const key2 = "test-key-456";

    const hash1 = hashKey(key1);
    const hash2 = hashKey(key2);

    expect(hash1).not.toBe(hash2);
  });

  it("should handle empty string", () => {
    const hash = hashKey("");
    expect(hash).toBeDefined();
    // biome-ignore lint/style/noMagicNumbers: 64 characters default
    expect(hash.length).toBe(64);
  });

  it("should handle very long keys", () => {
    // biome-ignore lint/style/noMagicNumbers: 10000 characters default
    const longKey = "a".repeat(10_000);
    const hash = hashKey(longKey);

    expect(hash).toBeDefined();
    // biome-ignore lint/style/noMagicNumbers: 64 characters default
    expect(hash.length).toBe(64);
  });

  it("should handle special characters", () => {
    const key = "!@#$%^&*()_+-=[]{}|;:,.<>?";
    const hash = hashKey(key);

    expect(hash).toBeDefined();
    // biome-ignore lint/style/noMagicNumbers: 64 characters default
    expect(hash.length).toBe(64);
  });

  it("should handle unicode characters", () => {
    const key = "测试密钥🔑";
    const hash = hashKey(key);

    expect(hash).toBeDefined();
    // biome-ignore lint/style/noMagicNumbers: 64 characters default
    expect(hash.length).toBe(64);
  });

  it("should produce different hashes with different algorithms", () => {
    const key = "test-key-123";
    const sha256Hash = hashKey(key, { algorithm: "sha256" });
    const sha512Hash = hashKey(key, { algorithm: "sha512" });

    expect(sha256Hash).not.toBe(sha512Hash);
    // biome-ignore lint/style/noMagicNumbers: 64 characters default
    expect(sha256Hash.length).toBe(64);
    // biome-ignore lint/style/noMagicNumbers: 128 characters default
    expect(sha512Hash.length).toBe(128);
  });

  it("should use salt when provided", () => {
    const key = "test-key-123";
    const hashWithoutSalt = hashKey(key);
    const hashWithSalt = hashKey(key, { salt: "secret-salt" });

    expect(hashWithoutSalt).not.toBe(hashWithSalt);
  });

  it("should produce consistent hashes with same salt", () => {
    const key = "test-key-123";
    const hash1 = hashKey(key, { salt: "secret-salt" });
    const hash2 = hashKey(key, { salt: "secret-salt" });

    expect(hash1).toBe(hash2);
  });

  it("should produce different hashes with different salts", () => {
    const key = "test-key-123";
    const hash1 = hashKey(key, { salt: "salt1" });
    const hash2 = hashKey(key, { salt: "salt2" });

    expect(hash1).not.toBe(hash2);
  });
});
