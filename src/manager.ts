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
	hasAllScopes,
	hasAnyScope,
	hasScope,
	type ScopeCheckOptions,
} from "./core/scopes";
import { validateKey } from "./core/validate";
import { MemoryStore } from "./storage/memory";
import { RedisStore } from "./storage/redis";
import type { ApiKeyMutableFields, ApiKeyRecord } from "./types/api-key-types";
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
import type { Storage } from "./types/storage-types";
import { logger } from "./utils/logger";

export type VerifyResult = {
	valid: boolean;
	record?: ApiKeyRecord;
	error?: string;
	errorCode?: ApiKeyErrorCode;
};

interface CacheRecord {
	id: string;
	expiresAt: string | null;
	revokedAt: string | null;
	enabled: boolean;
}

function isValidCacheRecord(data: unknown): data is CacheRecord {
	if (typeof data !== "object" || data === null) return false;
	const record = data as Record<string, unknown>;
	return (
		typeof record.id === "string" &&
		(record.expiresAt === null || typeof record.expiresAt === "string") &&
		(record.revokedAt === null || typeof record.revokedAt === "string") &&
		typeof record.enabled === "boolean"
	);
}

export type VerifyOptions = {
	skipCache?: boolean;
	headerNames?: string[];
	extractBearer?: boolean;
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
	private readonly auditLogsEnabled: boolean;
	private readonly defaultContext?: ActionContext;

	constructor(config: ConfigInput = {}) {
		const salt = config.salt
			? hashKey(config.salt, { algorithm: "sha256" })
			: "";

		this.config = {
			prefix: config.prefix,
			length: config.length ?? 32,
			algorithm: config.algorithm ?? "sha256",
			alphabet: config.alphabet,
			salt,
		};

		this.revokedKeyTtl = config.revokedKeyTtl ?? 604_800;
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
					const parsed: unknown = JSON.parse(cached);

					if (!isValidCacheRecord(parsed)) {
						logger.error(
							"CRITICAL: Invalid cache record shape, invalidating entry"
						);
						await this.cache.del(`apikey:${keyHash}`);
					} else {
						const cacheData = parsed;

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

						if (isExpired(record.expiresAt)) {
							await this.cache.del(`apikey:${keyHash}`);
							return createErrorResult(ApiKeyErrorCode.EXPIRED);
						}

						if (record.revokedAt) {
							await this.cache.del(`apikey:${keyHash}`);
							return createErrorResult(ApiKeyErrorCode.REVOKED);
						}

						if (this.autoTrackUsage && !options.skipTracking) {
							this.updateLastUsed(record.id).catch((err) => {
								logger.error("Failed to track usage:", err);
							});
						}

						return { valid: true, record };
					}
				} catch (error) {
					logger.error(
						"CRITICAL: Cache corruption detected, invalidating entry:",
						error
					);
					await this.cache.del(`apikey:${keyHash}`);
				}
			}
		}

		const record = await this.storage.findByHash(keyHash);

		if (!record) {
			return createErrorResult(ApiKeyErrorCode.INVALID_KEY);
		}

		if (isExpired(record.expiresAt)) {
			if (this.cache) {
				await this.cache.del(`apikey:${keyHash}`);
			}
			return createErrorResult(ApiKeyErrorCode.EXPIRED);
		}

		if (record.revokedAt) {
			if (this.cache) {
				await this.cache.del(`apikey:${keyHash}`);
			}
			return createErrorResult(ApiKeyErrorCode.REVOKED);
		}

		if (record.enabled === false) {
			return createErrorResult(ApiKeyErrorCode.DISABLED);
		}

		if (this.cache && !options.skipCache) {
			try {
				const expiresAt = record.expiresAt;
				const revokedAt = record.revokedAt;
				const cacheRecord: CacheRecord = {
					id: record.id,
					expiresAt:
						expiresAt instanceof Date
							? expiresAt.toISOString()
							: (expiresAt ?? null),
					revokedAt:
						revokedAt instanceof Date
							? revokedAt.toISOString()
							: (revokedAt ?? null),
					enabled: record.enabled ?? true,
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

		if (this.autoTrackUsage && !options.skipTracking) {
			this.updateLastUsed(record.id).catch((err) => {
				logger.error("Failed to track usage:", err);
			});
		}

		return { valid: true, record };
	}

	async create(
		input: Partial<ApiKeyMutableFields>,
		context?: ActionContext
	): Promise<{ key: string; record: ApiKeyRecord }> {
		const key = this.generateKey();
		const keyHash = this.hashKey(key);
		const now = new Date().toISOString();
		const tags = input.tags?.map((t) => t.toLowerCase());

		const record: ApiKeyRecord = {
			id: nanoid(),
			keyHash,
			ownerId: input.ownerId ?? "",
			name: input.name,
			description: input.description,
			scopes: input.scopes,
			resources: input.resources,
			expiresAt: input.expiresAt ?? null,
			createdAt: now,
			lastUsedAt: undefined,
			enabled: input.enabled ?? true,
			revokedAt: null,
			rotatedTo: null,
			tags,
		};

		await this.storage.save(record);

		await this.logAction("created", record.id, record.ownerId, {
			...context,
			metadata: {
				name: record.name,
				scopes: record.scopes,
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

		if (record.revokedAt) {
			throw createApiKeyError(ApiKeyErrorCode.ALREADY_REVOKED);
		}

		await this.storage.update(id, {
			revokedAt: new Date().toISOString(),
		});

		await this.logAction("revoked", id, record.ownerId, context);

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

		if (record.revokedAt) {
			throw createApiKeyError(ApiKeyErrorCode.CANNOT_MODIFY_REVOKED);
		}

		if (record.enabled) {
			throw createApiKeyError(ApiKeyErrorCode.ALREADY_ENABLED);
		}

		await this.storage.update(id, { enabled: true });

		await this.logAction("enabled", id, record.ownerId, context);

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

		if (record.revokedAt) {
			throw createApiKeyError(ApiKeyErrorCode.CANNOT_MODIFY_REVOKED);
		}

		if (!record.enabled) {
			throw createApiKeyError(ApiKeyErrorCode.ALREADY_DISABLED);
		}

		await this.storage.update(id, { enabled: false });

		await this.logAction("disabled", id, record.ownerId, context);

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
		input?: Partial<ApiKeyMutableFields>,
		context?: ActionContext
	): Promise<{ key: string; record: ApiKeyRecord; oldRecord: ApiKeyRecord }> {
		const oldRecord = await this.findById(id);
		if (!oldRecord) {
			throw createApiKeyError(ApiKeyErrorCode.KEY_NOT_FOUND);
		}

		if (oldRecord.revokedAt) {
			throw createApiKeyError(ApiKeyErrorCode.CANNOT_MODIFY_REVOKED);
		}

		const { key, record: newRecord } = await this.create({
			ownerId: oldRecord.ownerId,
			name: input?.name ?? oldRecord.name,
			description: input?.description ?? oldRecord.description,
			scopes: input?.scopes ?? oldRecord.scopes,
			resources: input?.resources ?? oldRecord.resources,
			expiresAt: input?.expiresAt ?? oldRecord.expiresAt,
			tags: input?.tags
				? input.tags.map((t) => t.toLowerCase())
				: oldRecord.tags,
		});

		await this.storage.update(id, {
			rotatedTo: newRecord.id,
			revokedAt: new Date().toISOString(),
		});

		await this.logAction("rotated", id, oldRecord.ownerId, {
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
		await this.storage.update(id, {
			lastUsedAt: new Date().toISOString(),
		});
	}

	private async logAction(
		action: AuditAction,
		keyId: string,
		ownerId: string,
		context?: ActionContext
	): Promise<void> {
		if (!(this.auditLogsEnabled && this.storage.saveLog)) {
			return;
		}

		const mergedContext = {
			...this.defaultContext,
			...context,
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

	async getLogs(query: AuditLogQuery = {}): Promise<AuditLog[]> {
		if (!this.auditLogsEnabled) {
			throw createApiKeyError(ApiKeyErrorCode.AUDIT_LOGGING_DISABLED);
		}

		if (!this.storage.findLogs) {
			throw createApiKeyError(ApiKeyErrorCode.STORAGE_NOT_SUPPORTED);
		}

		return await this.storage.findLogs(query);
	}

	async countLogs(query: AuditLogQuery = {}): Promise<number> {
		if (!this.auditLogsEnabled) {
			throw createApiKeyError(ApiKeyErrorCode.AUDIT_LOGGING_DISABLED);
		}

		if (!this.storage.countLogs) {
			throw createApiKeyError(ApiKeyErrorCode.STORAGE_NOT_SUPPORTED);
		}

		return await this.storage.countLogs(query);
	}

	async deleteLogs(query: AuditLogQuery): Promise<number> {
		if (!this.auditLogsEnabled) {
			throw createApiKeyError(ApiKeyErrorCode.AUDIT_LOGGING_DISABLED);
		}

		if (!this.storage.deleteLogs) {
			throw createApiKeyError(ApiKeyErrorCode.STORAGE_NOT_SUPPORTED);
		}

		return await this.storage.deleteLogs(query);
	}

	async clearLogs(keyId: string): Promise<number> {
		return await this.deleteLogs({ keyId });
	}

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
		return isExpired(record.expiresAt);
	}

	hasScope(
		record: ApiKeyRecord,
		scope: PermissionScope,
		options?: ScopeCheckOptions
	): boolean {
		return hasScope(record.scopes, scope, {
			...options,
			resources: options?.resources ?? record.resources,
		});
	}

	hasAnyScope(
		record: ApiKeyRecord,
		requiredScopes: PermissionScope[],
		options?: ScopeCheckOptions
	): boolean {
		return hasAnyScope(record.scopes, requiredScopes, {
			...options,
			resources: options?.resources ?? record.resources,
		});
	}

	hasAllScopes(
		record: ApiKeyRecord,
		requiredScopes: PermissionScope[],
		options?: ScopeCheckOptions
	): boolean {
		return hasAllScopes(record.scopes, requiredScopes, {
			...options,
			resources: options?.resources ?? record.resources,
		});
	}

	async verifyFromHeaders(
		headers: Record<string, string | undefined> | Headers,
		options?: VerifyOptions
	): Promise<ApiKeyRecord | null> {
		const result = await this.verify(headers, options);
		return result.valid ? (result.record ?? null) : null;
	}

	checkResourceScope(
		record: ApiKeyRecord | null,
		resourceType: string,
		resourceId: string,
		scope: PermissionScope
	): boolean {
		if (!record) return false;
		return this.hasScope(record, scope, {
			resource: `${resourceType}:${resourceId}`,
		});
	}

	checkResourceAnyScope(
		record: ApiKeyRecord | null,
		resourceType: string,
		resourceId: string,
		scopes: PermissionScope[]
	): boolean {
		if (!record) return false;
		return this.hasAnyScope(record, scopes, {
			resource: `${resourceType}:${resourceId}`,
		});
	}

	checkResourceAllScopes(
		record: ApiKeyRecord | null,
		resourceType: string,
		resourceId: string,
		scopes: PermissionScope[]
	): boolean {
		if (!record) return false;
		return this.hasAllScopes(record, scopes, {
			resource: `${resourceType}:${resourceId}`,
		});
	}
}

export function createKeys(config: ConfigInput = {}): ApiKeyManager {
	return new ApiKeyManager(config);
}
