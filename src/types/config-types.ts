import type Redis from "ioredis";
import { type Static, Type } from "typebox";
import type { Cache } from "../core/cache";
import type { Storage } from "./storage-types";

export const ConfigSchema = Type.Object({
	prefix: Type.Optional(Type.String()),
	length: Type.Optional(Type.Number({ default: 32 })),
	algorithm: Type.Optional(
		Type.Union([Type.Literal("sha256"), Type.Literal("sha512")], {
			default: "sha256",
		})
	),
	alphabet: Type.Optional(Type.String()),
	salt: Type.Optional(Type.String()),
});

export type Config = Static<typeof ConfigSchema>;

/**
 * Configuration options for API key management
 * @example
 * ```typescript
 * const keys = createKeys({
 *   prefix: "sk_live_",
 *   length: 40,
 *   storage: "redis",
 *   redis: redisClient,
 *   cache: true,
 *   cacheTtl: 300
 * });
 * ```
 */
export type ConfigInput = {
	/**
	 * Prefix for all generated API keys (e.g., "sk_live_", "sk_test_")
	 * @example "sk_live_"
	 */
	prefix?: string;

	/**
	 * Length of the generated key (excluding prefix)
	 * @default 32
	 * @example 40
	 */
	length?: number;

	/**
	 * Hashing algorithm for storing keys
	 * @default "sha256"
	 */
	algorithm?: "sha256" | "sha512";

	/**
	 * Custom alphabet for key generation (default: URL-safe base64)
	 * @example "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
	 */
	alphabet?: string;

	/**
	 * Salt for hashing (increases security)
	 * @example "my-secret-salt"
	 */
	salt?: string;

	/**
	 * Storage backend for API keys
	 * - "memory": In-memory storage (default, not persistent)
	 * - "redis": Redis storage (requires redis client)
	 * - Custom Storage object: Use your own storage implementation
	 * @default "memory"
	 */
	storage?: Storage | "memory" | "redis";

	/**
	 * Caching strategy for verified keys
	 * - true: In-memory cache
	 * - "redis": Redis cache (requires redis client)
	 * - Custom Cache object: Use your own cache implementation
	 * - false: No caching
	 * @default false
	 */
	cache?: Cache | boolean | "redis";

	/**
	 * Cache TTL in seconds
	 * @default 60
	 */
	cacheTtl?: number;

	/**
	 * HTTP header names to look for API keys
	 * @default ["authorization", "x-api-key"]
	 */
	headerNames?: string[];

	/**
	 * Extract Bearer token from Authorization header
	 * @default true
	 */
	extractBearer?: boolean;

	/**
	 * Redis client instance (required when using "redis" storage or cache)
	 */
	redis?: Redis;

	/**
	 * TTL in seconds for revoked keys in Redis
	 * @default 604800 (7 days)
	 * @example 0 to keep forever
	 */
	revokedKeyTtl?: number;

	/**
	 * Automatically update lastUsedAt when verifying a key
	 * @default true
	 */
	autoTrackUsage?: boolean;
};
