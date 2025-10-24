import { describe, expect, it } from "vitest";
import { hashKey } from "./hash";
import { validateKey } from "./validate";

describe("validateKey", () => {
  it("should validate a correct key", () => {
    const key = "test-key-123";
    const hash = hashKey(key);

    const isValid = validateKey(key, hash);
    expect(isValid).toBe(true);
  });

  it("should reject an incorrect key", () => {
    const key = "test-key-123";
    const wrongKey = "test-key-456";
    const hash = hashKey(key);

    const isValid = validateKey(wrongKey, hash);
    expect(isValid).toBe(false);
  });

  it("should validate with sha256 algorithm", () => {
    const key = "test-key-123";
    const hash = hashKey(key, { algorithm: "sha256" });

    const isValid = validateKey(key, hash, { algorithm: "sha256" });
    expect(isValid).toBe(true);
  });

  it("should validate with sha512 algorithm", () => {
    const key = "test-key-123";
    const hash = hashKey(key, { algorithm: "sha512" });

    const isValid = validateKey(key, hash, { algorithm: "sha512" });
    expect(isValid).toBe(true);
  });

  it("should reject when algorithm mismatch", () => {
    const key = "test-key-123";
    const storedHash = hashKey(key, { algorithm: "sha256" });

    const isValid = validateKey(key, storedHash, { algorithm: "sha512" });
    expect(isValid).toBe(false);
  });

  it("should handle empty string", () => {
    const key = "";
    const hash = hashKey(key);

    const isValid = validateKey(key, hash);
    expect(isValid).toBe(true);
  });

  it("should handle very long keys", () => {
    // biome-ignore lint/style/noMagicNumbers: 10000 characters default
    const key = "a".repeat(10_000);
    const hash = hashKey(key);

    const isValid = validateKey(key, hash);
    expect(isValid).toBe(true);
  });

  it("should handle special characters", () => {
    const key = "!@#$%^&*()_+-=[]{}|;:,.<>?";
    const hash = hashKey(key);

    const isValid = validateKey(key, hash);
    expect(isValid).toBe(true);
  });

  it("should handle unicode characters", () => {
    const key = "测试密钥🔑";
    const hash = hashKey(key);

    const isValid = validateKey(key, hash);
    expect(isValid).toBe(true);
  });

  it("should reject when hash length is different", () => {
    const key = "test-key-123";
    const fakeHash = "abc123";

    const isValid = validateKey(key, fakeHash);
    expect(isValid).toBe(false);
  });

  it("should reject invalid hash format", () => {
    const key = "test-key-123";
    // biome-ignore lint/style/noMagicNumbers: 64 characters default
    const fakeHash = "x".repeat(64);

    const isValid = validateKey(key, fakeHash);
    expect(isValid).toBe(false);
  });

  it("should handle single character change in key", () => {
    const key = "test-key-123";
    const similarKey = "test-key-124";
    const hash = hashKey(key);

    const isValid = validateKey(similarKey, hash);
    expect(isValid).toBe(false);
  });

  it("should handle single character change in hash", () => {
    const key = "test-key-123";
    const hash = hashKey(key);
    const tamperedHash = hash.slice(0, -1) + (hash.at(-1) === "a" ? "b" : "a");

    const isValid = validateKey(key, tamperedHash);
    expect(isValid).toBe(false);
  });

  it("should validate with salt", () => {
    const key = "test-key-123";
    const salt = "secret-salt";
    const hash = hashKey(key, { salt });

    const isValid = validateKey(key, hash, { salt });
    expect(isValid).toBe(true);
  });

  it("should reject when salt mismatch", () => {
    const key = "test-key-123";
    const hash = hashKey(key, { salt: "salt1" });

    const isValid = validateKey(key, hash, { salt: "salt2" });
    expect(isValid).toBe(false);
  });

  it("should reject when salt missing", () => {
    const key = "test-key-123";
    const hash = hashKey(key, { salt: "secret-salt" });

    const isValid = validateKey(key, hash);
    expect(isValid).toBe(false);
  });
});
