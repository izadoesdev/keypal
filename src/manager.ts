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
import type { Config, ConfigInput } from "./types/config-types";
import type { PermissionScope } from "./types/permissions-types";
import type { Storage } from "./types/storage-types";
import { logger } from "./utils/logger";

export type VerifyResult = {
	valid: boolean;
	record?: ApiKeyRecord;
	error?: string;
};

export type VerifyOptions = {
	skipCache?: boolean;
	headerNames?: string[];
	extractBearer?: boolean;
	/** Skip updating lastUsedAt timestamp (useful when autoTrackUsage is enabled) */
	skipTracking?: boolean;
};

export class ApiKeyManager {
	private readonly config: Config;
	private readonly storage: Storage;
	private readonly cache?: Cache;
	private readonly cacheTtl: number;
	private readonly extractionOptions: KeyExtractionOptions;
	private readonly revokedKeyTtl: number;
	private readonly isRedisStorage: boolean;
	private readonly autoTrackUsage: boolean;

	constructor(config: ConfigInput = {}) {
		this.config = {
			prefix: config.prefix,
			// biome-ignore lint/style/noMagicNumbers: 32 characters default
			length: config.length ?? 32,
			algorithm: config.algorithm ?? "sha256",
			alphabet: config.alphabet,
			salt: config.salt,
		};

		// biome-ignore lint/style/noMagicNumbers: 7 days default (604800 seconds)
		this.revokedKeyTtl = config.revokedKeyTtl ?? 604_800; // 7 days default (604800 seconds)
		this.isRedisStorage = config.storage === "redis";
		this.autoTrackUsage = config.autoTrackUsage ?? true;

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
			return { valid: false, error: "Missing API key" };
		}

		if (this.config.prefix && !key.startsWith(this.config.prefix)) {
			return { valid: false, error: "Invalid API key format" };
		}

		const keyHash = this.hashKey(key);

		if (this.cache && !options.skipCache) {
			const cached = await this.cache.get(`apikey:${keyHash}`);
			if (cached) {
				try {
					const record = JSON.parse(cached) as ApiKeyRecord;

					if (isExpired(record.metadata.expiresAt)) {
						await this.cache.del(`apikey:${keyHash}`);
						return { valid: false, error: "API key has expired" };
					}

					if (record.metadata.revokedAt) {
						await this.cache.del(`apikey:${keyHash}`);
						return { valid: false, error: "API key has been revoked" };
					}

					if (record.metadata.enabled === false) {
						return { valid: false, error: "API key is disabled" };
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
			return { valid: false, error: "Invalid API key" };
		}

		// Check expiration first
		if (isExpired(record.metadata.expiresAt)) {
			if (this.cache) {
				await this.cache.del(`apikey:${keyHash}`);
			}
			return { valid: false, error: "API key has expired" };
		}

		if (record.metadata.revokedAt) {
			if (this.cache) {
				await this.cache.del(`apikey:${keyHash}`);
			}
			return { valid: false, error: "API key has been revoked" };
		}

		if (record.metadata.enabled === false) {
			return { valid: false, error: "API key is disabled" };
		}

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

		// Track usage if enabled
		if (this.autoTrackUsage && !options.skipTracking) {
			this.updateLastUsed(record.id).catch((err) => {
				logger.error("Failed to track usage:", err);
			});
		}

		return { valid: true, record };
	}

	async create(
		metadata: Partial<ApiKeyMetadata>
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

	async revoke(id: string): Promise<void> {
		const record = await this.findById(id);
		if (!record) {
			return;
		}

		await this.storage.updateMetadata(id, {
			revokedAt: new Date().toISOString(),
		});

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

	async enable(id: string): Promise<void> {
		const record = await this.findById(id);
		if (!record) {
			throw new Error("API key not found");
		}

		await this.storage.updateMetadata(id, {
			enabled: true,
		});

		if (this.cache) {
			try {
				await this.cache.del(`apikey:${record.keyHash}`);
			} catch (error) {
				logger.error("CRITICAL: Failed to invalidate cache on enable:", error);
			}
		}
	}

	async disable(id: string): Promise<void> {
		const record = await this.findById(id);
		if (!record) {
			throw new Error("API key not found");
		}

		await this.storage.updateMetadata(id, {
			enabled: false,
		});

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
		metadata?: Partial<ApiKeyMetadata>
	): Promise<{ key: string; record: ApiKeyRecord; oldRecord: ApiKeyRecord }> {
		const oldRecord = await this.findById(id);
		if (!oldRecord) {
			throw new Error("API key not found");
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
}

export function createKeys(config: ConfigInput = {}): ApiKeyManager {
	return new ApiKeyManager(config);
}
