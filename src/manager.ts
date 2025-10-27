import { nanoid } from "nanoid";
import { type Cache, MemoryCache, RedisCache } from "./core/cache";
import { isExpired } from "./core/expiration";
import {
	extractKeyFromHeaders,
	hasApiKey,
	type KeyExtractionOptions,
} from "./core/extract-key";
import { generateKey } from "./core/generate";
import { hashKey } from "./core/hash";
import { RateLimiter } from "./core/rate-limiter";
import {
	hasAllScopesWithResources,
	hasAnyScopeWithResources,
	hasScopeWithResources,
	type ScopeCheckOptions,
} from "./core/scopes";
import { validateKey } from "./core/validate";
import { MemoryStore } from "./storage/memory";
import { RedisStore } from "./storage/redis";
import type { ApiKeyMetadata, ApiKeyRecord } from "./types/api-key-types";
import type {
	ActionContext,
	AuditAction,
	AuditLog,
	AuditLogQuery,
	AuditLogStats,
} from "./types/audit-log-types";
import type { Config, ConfigInput } from "./types/config-types";
import {
	ApiKeyErrorCode,
	createApiKeyError,
	createErrorResult,
} from "./types/error-types";
import type { PermissionScope } from "./types/permissions-types";
import type { RateLimitConfig } from "./types/rate-limit-types";
import type { Storage } from "./types/storage-types";
import { logger } from "./utils/logger";

/**
 * Result of verifying an API key
 */
export type VerifyResult = {
	/** Whether the key is valid */
	valid: boolean;
	/** The API key record if valid */
	record?: ApiKeyRecord;
	/** Error message if invalid */
	error?: string;
	/** Error code for programmatic handling */
	errorCode?: ApiKeyErrorCode;
	/** Rate limit information (only included if rate limiting is enabled) */
	rateLimit?: {
		/** Current request count in the window */
		current: number;
		/** Maximum number of requests allowed within the window */
		limit: number;
		/** Number of requests remaining within the window */
		remaining: number;
		/** Time in milliseconds until the window resets */
		resetMs: number;
		/** ISO timestamp when the window resets */
		resetAt: string;
	};
};

/**
 * Minimal record stored in cache to reduce exposure
 */
type CacheRecord = {
	id: string;
	expiresAt: string | null;
	revokedAt: string | null;
	enabled: boolean;
};

/**
 * Options for verifying API keys
 */
export type VerifyOptions = {
	/** Skip cache lookup (always query storage) */
	skipCache?: boolean;
	/** Override header names to look for */
	headerNames?: string[];
	/** Override extractBearer behavior */
	extractBearer?: boolean;
	/** Skip updating lastUsedAt timestamp (useful when autoTrackUsage is enabled) */
	skipTracking?: boolean;
};

/**
 * API Key Manager for creating, verifying, and managing API keys
 *
 * @example
 * ```typescript
 * const keys = createKeys({
 *   prefix: "sk_live_",
 *   storage: "redis",
 *   redis: redisClient
 * });
 *
 * // Create a key
 * const { key, record } = await keys.create({
 *   ownerId: "user_123",
 *   name: "Production Key",
 *   scopes: ["read", "write"]
 * });
 *
 * // Verify a key
 * const result = await keys.verify(key);
 * if (result.valid) {
 *   console.log("Key belongs to:", result.record?.metadata.ownerId);
 * }
 * ```
 */
export class ApiKeyManager {
	private readonly config: Config;
	private readonly storage: Storage;
	private readonly cache?: Cache;
	private readonly cacheTtl: number;
	private readonly extractionOptions: KeyExtractionOptions;
	private readonly revokedKeyTtl: number;
	private readonly isRedisStorage: boolean;
	private readonly autoTrackUsage: boolean;
	private readonly rateLimiter?: RateLimiter;
	private readonly auditLogsEnabled: boolean;
	private readonly defaultContext?: ActionContext;

	constructor(config: ConfigInput = {}) {
		const salt = config.salt
			? hashKey(config.salt, { algorithm: "sha256" })
			: "";

		this.config = {
			prefix: config.prefix,
			// biome-ignore lint/style/noMagicNumbers: 32 characters default
			length: config.length ?? 32,
			algorithm: config.algorithm ?? "sha256",
			alphabet: config.alphabet,
			salt,
		};

		// biome-ignore lint/style/noMagicNumbers: 7 days default (604800 seconds)
		this.revokedKeyTtl = config.revokedKeyTtl ?? 604_800; // 7 days default (604800 seconds)
		this.isRedisStorage = config.storage === "redis";
		this.autoTrackUsage = config.autoTrackUsage ?? true;
		this.auditLogsEnabled = config.auditLogs ?? false;
		this.defaultContext = config.auditContext;

		if (config.storage === "redis") {
			if (!config.redis) {
				throw new Error('Redis client required when storage is "redis"');
			}
			try {
				this.storage = new RedisStore({ client: config.redis });
			} catch (error) {
				logger.error("CRITICAL: Failed to initialize Redis storage:", error);
				throw error;
			}
		} else if (config.storage && typeof config.storage === "object") {
			this.storage = config.storage;
		} else {
			this.storage = new MemoryStore();
		}

		this.cacheTtl = config.cacheTtl ?? 60;
		this.extractionOptions = {
			headerNames: config.headerNames ?? ["authorization", "x-api-key"],
			extractBearer: config.extractBearer ?? true,
		};

		if (config.cache === "redis") {
			if (!config.redis) {
				throw new Error("[keypal] Redis client required when cache is 'redis'");
			}
			try {
				this.cache = new RedisCache(config.redis);
			} catch (error) {
				logger.error("CRITICAL: Failed to initialize Redis cache:", error);
				throw error;
			}
		} else if (config.cache === true) {
			this.cache = new MemoryCache();
		} else if (config.cache && typeof config.cache === "object") {
			this.cache = config.cache;
		}
		// else: cache is false/undefined by default, no caching

		// Initialize rate limiter if configured
		if (config.rateLimit) {
			this.rateLimiter = this.createRateLimiter(config.rateLimit);
		}
	}

	generateKey(): string {
		return generateKey({
			prefix: this.config.prefix,
			length: this.config.length,
			alphabet: this.config.alphabet,
		});
	}

	hashKey(key: string): string {
		return hashKey(key, {
			algorithm: this.config.algorithm,
			salt: this.config.salt,
		});
	}

	validateKey(key: string, storedHash: string): boolean {
		return validateKey(key, storedHash, {
			algorithm: this.config.algorithm,
			salt: this.config.salt,
		});
	}

	/**
	 * Extract API key from HTTP headers
	 *
	 * @param headers - HTTP headers object or Headers instance
	 * @param options - Optional extraction options
	 * @returns The extracted API key or null if not found
	 *
	 * @example
	 * ```typescript
	 * const key = keys.extractKey(req.headers);
	 * if (key) {
	 *   console.log("Found key:", key);
	 * }
	 * ```
	 */
	extractKey(
		headers: Record<string, string | undefined> | Headers,
		options?: KeyExtractionOptions
	): string | null {
		const mergedOptions = {
			headerNames: options?.headerNames ?? this.extractionOptions.headerNames,
			extractBearer:
				options?.extractBearer ?? this.extractionOptions.extractBearer,
		};
		return extractKeyFromHeaders(headers, mergedOptions);
	}

	/**
	 * Check if an API key is present in HTTP headers
	 *
	 * @param headers - HTTP headers object or Headers instance
	 * @param options - Optional extraction options
	 * @returns True if an API key is found in headers
	 *
	 * @example
	 * ```typescript
	 * if (keys.hasKey(req.headers)) {
	 *   // API key is present
	 * }
	 * ```
	 */
	hasKey(
		headers: Record<string, string | undefined> | Headers,
		options?: KeyExtractionOptions
	): boolean {
		const mergedOptions = {
			headerNames: options?.headerNames ?? this.extractionOptions.headerNames,
			extractBearer:
				options?.extractBearer ?? this.extractionOptions.extractBearer,
		};
		return hasApiKey(headers, mergedOptions);
	}

	/**
	 * Verify an API key from a string or HTTP headers
	 *
	 * @param keyOrHeader - The API key string or HTTP headers object
	 * @param options - Verification options
	 * @returns Verification result with validity status and record
	 *
	 * @example
	 * ```typescript
	 * // Verify from string
	 * const result = await keys.verify("sk_live_abc123...");
	 *
	 * // Verify from headers
	 * const result = await keys.verify(req.headers);
	 *
	 * if (result.valid) {
	 *   console.log("Owner:", result.record?.metadata.ownerId);
	 * } else {
	 *   console.log("Error:", result.error);
	 * }
	 * ```
	 */
	async verify(
		keyOrHeader: string | Record<string, string | undefined> | Headers,
		options: VerifyOptions = {}
	): Promise<VerifyResult> {
		let key: string | null;

		if (typeof keyOrHeader === "string") {
			key = keyOrHeader;
			if (keyOrHeader.startsWith("Bearer ")) {
				// biome-ignore lint/style/noMagicNumbers: Authorization prefix is always 7 characters
				key = keyOrHeader.slice(7).trim();
			}
		} else {
			const extractOptions: KeyExtractionOptions = {
				headerNames: options.headerNames ?? this.extractionOptions.headerNames,
				extractBearer:
					options.extractBearer ?? this.extractionOptions.extractBearer,
			};
			key = this.extractKey(keyOrHeader, extractOptions);
		}

		if (!key) {
			return createErrorResult(ApiKeyErrorCode.MISSING_KEY);
		}

		if (this.config.prefix && !key.startsWith(this.config.prefix)) {
			return createErrorResult(ApiKeyErrorCode.INVALID_FORMAT);
		}

		const keyHash = this.hashKey(key);

		if (this.cache && !options.skipCache) {
			const cached = await this.cache.get(`apikey:${keyHash}`);
			if (cached) {
				try {
					const cacheData = JSON.parse(cached) as CacheRecord;

					if (cacheData.expiresAt && isExpired(cacheData.expiresAt)) {
						await this.cache.del(`apikey:${keyHash}`);
						return createErrorResult(ApiKeyErrorCode.EXPIRED);
					}

					if (cacheData.revokedAt) {
						await this.cache.del(`apikey:${keyHash}`);
						return createErrorResult(ApiKeyErrorCode.REVOKED);
					}

					if (cacheData.enabled === false) {
						return createErrorResult(ApiKeyErrorCode.DISABLED);
					}

					const record = await this.storage.findById(cacheData.id);
					if (!record) {
						await this.cache.del(`apikey:${keyHash}`);
						return createErrorResult(ApiKeyErrorCode.INVALID_KEY);
					}

					if (isExpired(record.metadata.expiresAt)) {
						await this.cache.del(`apikey:${keyHash}`);
						return createErrorResult(ApiKeyErrorCode.EXPIRED);
					}

					if (record.metadata.revokedAt) {
						await this.cache.del(`apikey:${keyHash}`);
						return createErrorResult(ApiKeyErrorCode.REVOKED);
					}

					if (record.metadata.enabled === false) {
						return createErrorResult(ApiKeyErrorCode.DISABLED);
					}

					// Check rate limit if enabled
					if (this.rateLimiter) {
						const rateLimitResult = await this.rateLimiter.check(record);
						if (!rateLimitResult.allowed) {
							return {
								...createErrorResult(ApiKeyErrorCode.RATE_LIMIT_EXCEEDED),
								rateLimit: {
									current: rateLimitResult.current,
									limit: rateLimitResult.limit,
									remaining: rateLimitResult.remaining,
									resetMs: rateLimitResult.resetMs,
									resetAt: rateLimitResult.resetAt,
								},
							};
						}

						// Track usage if enabled
						if (this.autoTrackUsage && !options.skipTracking) {
							this.updateLastUsed(record.id).catch((err) => {
								logger.error("Failed to track usage:", err);
							});
						}

						return {
							valid: true,
							record,
							rateLimit: {
								current: rateLimitResult.current,
								limit: rateLimitResult.limit,
								remaining: rateLimitResult.remaining,
								resetMs: rateLimitResult.resetMs,
								resetAt: rateLimitResult.resetAt,
							},
						};
					}

					// Track usage if enabled
					if (this.autoTrackUsage && !options.skipTracking) {
						this.updateLastUsed(record.id).catch((err) => {
							logger.error("Failed to track usage:", err);
						});
					}

					return { valid: true, record };
				} catch (error) {
					logger.error(
						"CRITICAL: Cache corruption detected, invalidating entry:",
						error
					);
					this.cache.del(`apikey:${keyHash}`);
				}
			}
		}

		const record = await this.storage.findByHash(keyHash);

		if (!record) {
			return createErrorResult(ApiKeyErrorCode.INVALID_KEY);
		}

		// Check expiration first
		if (isExpired(record.metadata.expiresAt)) {
			if (this.cache) {
				await this.cache.del(`apikey:${keyHash}`);
			}
			return createErrorResult(ApiKeyErrorCode.EXPIRED);
		}

		if (record.metadata.revokedAt) {
			if (this.cache) {
				await this.cache.del(`apikey:${keyHash}`);
			}
			return createErrorResult(ApiKeyErrorCode.REVOKED);
		}

		if (record.metadata.enabled === false) {
			return createErrorResult(ApiKeyErrorCode.DISABLED);
		}

		// Check rate limit if enabled
		if (this.rateLimiter) {
			// Cache the record first so subsequent requests can use the cache path
			if (this.cache && !options.skipCache) {
				try {
					await this.cache.set(
						`apikey:${keyHash}`,
						JSON.stringify(record),
						this.cacheTtl
					);
				} catch (error) {
					logger.error("CRITICAL: Failed to write to cache:", error);
				}
			}

			const rateLimitResult = await this.rateLimiter.check(record);
			if (!rateLimitResult.allowed) {
				return {
					valid: false,
					error: "Rate limit exceeded",
					errorCode: ApiKeyErrorCode.RATE_LIMIT_EXCEEDED,
					rateLimit: {
						current: rateLimitResult.current,
						limit: rateLimitResult.limit,
						remaining: rateLimitResult.remaining,
						resetMs: rateLimitResult.resetMs,
						resetAt: rateLimitResult.resetAt,
					},
				};
			}

			// Track usage if enabled
			if (this.autoTrackUsage && !options.skipTracking) {
				this.updateLastUsed(record.id).catch((err) => {
					logger.error("Failed to track usage:", err);
				});
			}

			return {
				valid: true,
				record,
				rateLimit: {
					current: rateLimitResult.current,
					limit: rateLimitResult.limit,
					remaining: rateLimitResult.remaining,
					resetMs: rateLimitResult.resetMs,
					resetAt: rateLimitResult.resetAt,
				},
			};
		}

		if (this.cache && !options.skipCache) {
			try {
				const cacheRecord: CacheRecord = {
					id: record.id,
					expiresAt: record.metadata.expiresAt ?? null,
					revokedAt: record.metadata.revokedAt ?? null,
					enabled: record.metadata.enabled ?? true,
				};
				await this.cache.set(
					`apikey:${keyHash}`,
					JSON.stringify(cacheRecord),
					this.cacheTtl
				);
			} catch (error) {
				logger.error("CRITICAL: Failed to write to cache:", error);
			}
		}

		// Track usage if enabled
		if (this.autoTrackUsage && !options.skipTracking) {
			this.updateLastUsed(record.id).catch((err) => {
				logger.error("Failed to track usage:", err);
			});
		}

		return { valid: true, record };
	}

	/**
	 * Create a new API key
	 *
	 * @param metadata - Metadata for the API key (ownerId is required)
	 * @returns The generated key string and the stored record
	 *
	 * @example
	 * ```typescript
	 * const { key, record } = await keys.create({
	 *   ownerId: "user_123",
	 *   name: "Production Key",
	 *   description: "API key for production access",
	 *   scopes: ["read", "write"],
	 *   expiresAt: "2025-12-31T00:00:00.000Z",
	 *   tags: ["production", "api"]
	 * });
	 *
	 * console.log("New key:", key);
	 * console.log("Key ID:", record.id);
	 * ```
	 */
	async create(
		metadata: Partial<ApiKeyMetadata>,
		context?: ActionContext
	): Promise<{ key: string; record: ApiKeyRecord }> {
		const key = this.generateKey();
		const keyHash = this.hashKey(key);
		const now = new Date().toISOString();
		const tags = metadata.tags?.map((t) => t.toLowerCase());

		const record: ApiKeyRecord = {
			id: nanoid(),
			keyHash,
			metadata: {
				ownerId: metadata.ownerId ?? "",
				name: metadata.name,
				description: metadata.description,
				scopes: metadata.scopes,
				resources: metadata.resources,
				expiresAt: metadata.expiresAt ?? null,
				createdAt: now,
				lastUsedAt: undefined,
				enabled: metadata.enabled ?? true,
				revokedAt: null,
				rotatedTo: null,
				tags,
			},
		};

		await this.storage.save(record);

		// Create audit log with key details
		await this.logAction("created", record.id, record.metadata.ownerId, {
			...context,
			metadata: {
				name: record.metadata.name,
				scopes: record.metadata.scopes,
				...context?.metadata,
			},
		});

		return { key, record };
	}

	async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
		return await this.storage.findByHash(keyHash);
	}

	async findById(id: string): Promise<ApiKeyRecord | null> {
		return await this.storage.findById(id);
	}

	async findByTags(tags: string[], ownerId?: string): Promise<ApiKeyRecord[]> {
		return await this.storage.findByTags(tags, ownerId);
	}

	async findByTag(tag: string, ownerId?: string): Promise<ApiKeyRecord[]> {
		return await this.storage.findByTag(tag, ownerId);
	}

	async list(ownerId: string): Promise<ApiKeyRecord[]> {
		return await this.storage.findByOwner(ownerId);
	}

	async revoke(id: string, context?: ActionContext): Promise<void> {
		const record = await this.findById(id);
		if (!record) {
			throw createApiKeyError(ApiKeyErrorCode.KEY_NOT_FOUND);
		}

		// Check if already revoked
		if (record.metadata.revokedAt) {
			throw createApiKeyError(ApiKeyErrorCode.ALREADY_REVOKED);
		}

		await this.storage.updateMetadata(id, {
			revokedAt: new Date().toISOString(),
		});

		// Create audit log
		await this.logAction("revoked", id, record.metadata.ownerId, context);

		if (this.cache) {
			try {
				await this.cache.del(`apikey:${record.keyHash}`);
			} catch (error) {
				logger.error("CRITICAL: Failed to invalidate cache on revoke:", error);
			}
		}

		if (this.isRedisStorage && this.revokedKeyTtl > 0) {
			try {
				if (this.storage instanceof RedisStore) {
					await this.storage.setTtl(id, this.revokedKeyTtl);
				}
			} catch (error) {
				logger.error("Failed to set TTL on revoked key:", error);
			}
		}
	}

	async revokeAll(ownerId: string): Promise<void> {
		const records = await this.list(ownerId);

		await Promise.all(records.map((record) => this.revoke(record.id)));
	}

	async enable(id: string, context?: ActionContext): Promise<void> {
		const record = await this.findById(id);
		if (!record) {
			throw createApiKeyError(ApiKeyErrorCode.KEY_NOT_FOUND);
		}

		// Check if key is revoked
		if (record.metadata.revokedAt) {
			throw createApiKeyError(ApiKeyErrorCode.CANNOT_MODIFY_REVOKED);
		}

		// Check if already enabled
		if (record.metadata.enabled) {
			throw createApiKeyError(ApiKeyErrorCode.ALREADY_ENABLED);
		}

		await this.storage.updateMetadata(id, {
			enabled: true,
		});

		// Create audit log
		await this.logAction("enabled", id, record.metadata.ownerId, context);

		if (this.cache) {
			try {
				await this.cache.del(`apikey:${record.keyHash}`);
			} catch (error) {
				logger.error("CRITICAL: Failed to invalidate cache on enable:", error);
			}
		}
	}

	async disable(id: string, context?: ActionContext): Promise<void> {
		const record = await this.findById(id);
		if (!record) {
			throw createApiKeyError(ApiKeyErrorCode.KEY_NOT_FOUND);
		}

		// Check if key is revoked
		if (record.metadata.revokedAt) {
			throw createApiKeyError(ApiKeyErrorCode.CANNOT_MODIFY_REVOKED);
		}

		// Check if already disabled
		if (!record.metadata.enabled) {
			throw createApiKeyError(ApiKeyErrorCode.ALREADY_DISABLED);
		}

		await this.storage.updateMetadata(id, {
			enabled: false,
		});

		// Create audit log
		await this.logAction("disabled", id, record.metadata.ownerId, context);

		if (this.cache) {
			try {
				await this.cache.del(`apikey:${record.keyHash}`);
			} catch (error) {
				logger.error("CRITICAL: Failed to invalidate cache on disable:", error);
			}
		}
	}

	async rotate(
		id: string,
		metadata?: Partial<ApiKeyMetadata>,
		context?: ActionContext
	): Promise<{ key: string; record: ApiKeyRecord; oldRecord: ApiKeyRecord }> {
		const oldRecord = await this.findById(id);
		if (!oldRecord) {
			throw createApiKeyError(ApiKeyErrorCode.KEY_NOT_FOUND);
		}

		// Check if key is already revoked
		if (oldRecord.metadata.revokedAt) {
			throw createApiKeyError(ApiKeyErrorCode.CANNOT_MODIFY_REVOKED);
		}

		const { key, record: newRecord } = await this.create({
			ownerId: oldRecord.metadata.ownerId,
			name: metadata?.name ?? oldRecord.metadata.name,
			description: metadata?.description ?? oldRecord.metadata.description,
			scopes: metadata?.scopes ?? oldRecord.metadata.scopes,
			resources: metadata?.resources ?? oldRecord.metadata.resources,
			expiresAt: metadata?.expiresAt ?? oldRecord.metadata.expiresAt,
			tags: metadata?.tags
				? metadata.tags.map((t) => t.toLowerCase())
				: oldRecord.metadata.tags,
		});

		await this.storage.updateMetadata(id, {
			rotatedTo: newRecord.id,
			revokedAt: new Date().toISOString(),
		});

		// Create audit log with rotation details
		await this.logAction("rotated", id, oldRecord.metadata.ownerId, {
			...context,
			metadata: {
				rotatedTo: newRecord.id,
				...context?.metadata,
			},
		});

		if (this.cache) {
			try {
				await this.cache.del(`apikey:${oldRecord.keyHash}`);
			} catch (error) {
				logger.error("CRITICAL: Failed to invalidate cache on rotate:", error);
			}
		}

		if (this.isRedisStorage && this.revokedKeyTtl > 0) {
			try {
				if (this.storage instanceof RedisStore) {
					await this.storage.setTtl(id, this.revokedKeyTtl);
				}
			} catch (error) {
				logger.error("Failed to set TTL on rotated key:", error);
			}
		}

		return { key, record: newRecord, oldRecord };
	}

	async updateLastUsed(id: string): Promise<void> {
		await this.storage.updateMetadata(id, {
			lastUsedAt: new Date().toISOString(),
		});
	}

	/**
	 * Create an audit log entry for a key action
	 * @private
	 */
	private async logAction(
		action: AuditAction,
		keyId: string,
		ownerId: string,
		context?: ActionContext
	): Promise<void> {
		if (!(this.auditLogsEnabled && this.storage.saveLog)) {
			return;
		}

		// Merge default context with action-specific context
		const mergedContext = {
			...this.defaultContext,
			...context,
			// Merge metadata objects if both exist
			...(this.defaultContext?.metadata || context?.metadata
				? {
						metadata: {
							...this.defaultContext?.metadata,
							...context?.metadata,
						},
					}
				: {}),
		};

		const log: AuditLog = {
			id: nanoid(),
			action,
			keyId,
			ownerId,
			timestamp: new Date().toISOString(),
			data: Object.keys(mergedContext).length > 0 ? mergedContext : undefined,
		};

		try {
			await this.storage.saveLog(log);
		} catch (error) {
			logger.error("Failed to save audit log:", error);
		}
	}

	/**
	 * Get audit logs with optional filters
	 *
	 * @param query - Query options for filtering audit logs
	 * @returns Array of audit log entries
	 *
	 * @example
	 * ```typescript
	 * const logs = await keys.getLogs({
	 *   keyId: 'key_123',
	 *   startDate: '2025-01-01',
	 *   endDate: '2025-12-31',
	 *   limit: 100
	 * });
	 * ```
	 */
	async getLogs(query: AuditLogQuery = {}): Promise<AuditLog[]> {
		if (!this.auditLogsEnabled) {
			throw createApiKeyError(ApiKeyErrorCode.AUDIT_LOGGING_DISABLED);
		}

		if (!this.storage.findLogs) {
			throw createApiKeyError(ApiKeyErrorCode.STORAGE_NOT_SUPPORTED);
		}

		return await this.storage.findLogs(query);
	}

	/**
	 * Count audit logs matching query
	 *
	 * @param query - Query options for filtering audit logs
	 * @returns Number of matching logs
	 *
	 * @example
	 * ```typescript
	 * const count = await keys.countLogs({ action: 'created' });
	 * ```
	 */
	async countLogs(query: AuditLogQuery = {}): Promise<number> {
		if (!this.auditLogsEnabled) {
			throw createApiKeyError(ApiKeyErrorCode.AUDIT_LOGGING_DISABLED);
		}

		if (!this.storage.countLogs) {
			throw createApiKeyError(ApiKeyErrorCode.STORAGE_NOT_SUPPORTED);
		}

		return await this.storage.countLogs(query);
	}

	/**
	 * Delete audit logs matching query
	 *
	 * @param query - Query options for filtering logs to delete
	 * @returns Number of logs deleted
	 *
	 * @example
	 * ```typescript
	 * // Delete old logs
	 * const deleted = await keys.deleteLogs({
	 *   endDate: '2024-01-01'
	 * });
	 * ```
	 */
	async deleteLogs(query: AuditLogQuery): Promise<number> {
		if (!this.auditLogsEnabled) {
			throw createApiKeyError(ApiKeyErrorCode.AUDIT_LOGGING_DISABLED);
		}

		if (!this.storage.deleteLogs) {
			throw createApiKeyError(ApiKeyErrorCode.STORAGE_NOT_SUPPORTED);
		}

		return await this.storage.deleteLogs(query);
	}

	/**
	 * Delete all audit logs for a specific key
	 *
	 * @param keyId - The key ID to delete logs for
	 * @returns Number of logs deleted
	 *
	 * @example
	 * ```typescript
	 * const deleted = await keys.clearLogs('key_123');
	 * ```
	 */
	async clearLogs(keyId: string): Promise<number> {
		return await this.deleteLogs({ keyId });
	}

	/**
	 * Get statistics about audit logs for an owner
	 *
	 * @param ownerId - Owner ID to get stats for
	 * @returns Statistics including total count, counts by action, and last activity
	 *
	 * @example
	 * ```typescript
	 * const stats = await keys.getLogStats('user_123');
	 * console.log(`Total logs: ${stats.total}`);
	 * console.log(`Created: ${stats.byAction.created}`);
	 * ```
	 */
	async getLogStats(ownerId: string): Promise<AuditLogStats> {
		if (!this.auditLogsEnabled) {
			throw createApiKeyError(ApiKeyErrorCode.AUDIT_LOGGING_DISABLED);
		}

		if (!this.storage.getLogStats) {
			throw createApiKeyError(ApiKeyErrorCode.STORAGE_NOT_SUPPORTED);
		}

		return await this.storage.getLogStats(ownerId);
	}

	async invalidateCache(keyHash: string): Promise<void> {
		if (this.cache) {
			try {
				await this.cache.del(`apikey:${keyHash}`);
			} catch (error) {
				logger.error("CRITICAL: Failed to invalidate cache:", error);
				throw error;
			}
		}
	}

	isExpired(record: ApiKeyRecord): boolean {
		return isExpired(record.metadata.expiresAt);
	}

	/**
	 * Check if an API key has a specific scope
	 *
	 * @param record - The API key record
	 * @param scope - Required scope to check
	 * @param options - Optional scope check options (e.g., resource filtering)
	 * @returns True if the key has the required scope
	 *
	 * @example
	 * ```typescript
	 * const record = await storage.findById("key_id");
	 * if (keys.hasScope(record, "read")) {
	 *   // Key has read permission
	 * }
	 *
	 * // Check for resource-specific scope
	 * if (keys.hasScope(record, "write", { resource: "project:123" })) {
	 *   // Key can write to project 123
	 * }
	 * ```
	 */
	hasScope(
		record: ApiKeyRecord,
		scope: PermissionScope,
		options?: ScopeCheckOptions
	): boolean {
		return hasScopeWithResources(
			record.metadata.scopes,
			record.metadata.resources,
			scope,
			options
		);
	}

	/**
	 * Check if an API key has any of the required scopes
	 *
	 * @param record - The API key record
	 * @param requiredScopes - Array of scopes to check
	 * @param options - Optional scope check options
	 * @returns True if the key has at least one of the required scopes
	 *
	 * @example
	 * ```typescript
	 * if (keys.hasAnyScope(record, ["read", "write"])) {
	 *   // Key has read OR write permission
	 * }
	 * ```
	 */
	hasAnyScope(
		record: ApiKeyRecord,
		requiredScopes: PermissionScope[],
		options?: ScopeCheckOptions
	): boolean {
		return hasAnyScopeWithResources(
			record.metadata.scopes,
			record.metadata.resources,
			requiredScopes,
			options
		);
	}

	/**
	 * Check if an API key has all required scopes
	 *
	 * @param record - The API key record
	 * @param requiredScopes - Array of scopes to check
	 * @param options - Optional scope check options
	 * @returns True if the key has all required scopes
	 *
	 * @example
	 * ```typescript
	 * if (keys.hasAllScopes(record, ["read", "write"])) {
	 *   // Key has read AND write permissions
	 * }
	 * ```
	 */
	hasAllScopes(
		record: ApiKeyRecord,
		requiredScopes: PermissionScope[],
		options?: ScopeCheckOptions
	): boolean {
		return hasAllScopesWithResources(
			record.metadata.scopes,
			record.metadata.resources,
			requiredScopes,
			options
		);
	}

	/**
	 * Verify API key from headers and return the record or null
	 * This is a convenience method that combines verify() with automatic null handling
	 */
	async verifyFromHeaders(
		headers: Record<string, string | undefined> | Headers,
		options?: VerifyOptions
	): Promise<ApiKeyRecord | null> {
		const result = await this.verify(headers, options);
		return result.valid ? (result.record ?? null) : null;
	}

	/**
	 * Check if an API key has a specific scope for a resource
	 * @param record - The API key record
	 * @param resourceType - Type of resource (e.g., 'website', 'project', 'team')
	 * @param resourceId - ID of the resource
	 * @param scope - Required scope to check
	 */
	checkResourceScope(
		record: ApiKeyRecord | null,
		resourceType: string,
		resourceId: string,
		scope: PermissionScope
	): boolean {
		if (!record) {
			return false;
		}
		return this.hasScope(record, scope, {
			resource: `${resourceType}:${resourceId}`,
		});
	}

	/**
	 * Check if an API key has any of the required scopes for a resource
	 */
	checkResourceAnyScope(
		record: ApiKeyRecord | null,
		resourceType: string,
		resourceId: string,
		scopes: PermissionScope[]
	): boolean {
		if (!record) {
			return false;
		}
		return this.hasAnyScope(record, scopes, {
			resource: `${resourceType}:${resourceId}`,
		});
	}

	/**
	 * Check if an API key has all required scopes for a resource
	 */
	checkResourceAllScopes(
		record: ApiKeyRecord | null,
		resourceType: string,
		resourceId: string,
		scopes: PermissionScope[]
	): boolean {
		if (!record) {
			return false;
		}
		return this.hasAllScopes(record, scopes, {
			resource: `${resourceType}:${resourceId}`,
		});
	}

	/**
	 * Create a rate limiter instance
	 *
	 * @param config - Rate limit configuration
	 * @returns A RateLimiter instance for checking request limits
	 *
	 * @example
	 * ```typescript
	 * const rateLimiter = keys.createRateLimiter({
	 *   maxRequests: 100,
	 *   windowMs: 60000, // 1 minute
	 * });
	 *
	 * const result = await rateLimiter.check(apiKeyRecord);
	 * if (!result.allowed) {
	 *   throw new Error(`Rate limit exceeded. Reset in ${result.resetMs}ms`);
	 * }
	 * ```
	 */
	createRateLimiter(config: RateLimitConfig): RateLimiter {
		if (!this.cache) {
			throw new Error(
				"[keypal] Cache is required for rate limiting. Enable cache in ApiKeyManager config."
			);
		}

		return new RateLimiter(this.cache, config);
	}
}

/**
 * Create an API key manager instance
 *
 * @param config - Configuration options for key generation and storage
 * @returns An ApiKeyManager instance for creating and verifying keys
 *
 * @example
 * ```typescript
 * // Simple in-memory setup
 * const keys = createKeys({ prefix: "sk_" });
 *
 * // Redis setup with caching
 * const keys = createKeys({
 *   prefix: "sk_live_",
 *   storage: "redis",
 *   redis: redisClient,
 *   cache: true,
 *   cacheTtl: 300
 * });
 *
 * // Custom storage adapter
 * const keys = createKeys({
 *   storage: myCustomStorage
 * });
 * ```
 */
export function createKeys(config: ConfigInput = {}): ApiKeyManager {
	return new ApiKeyManager(config);
}
