// biome-ignore lint/performance/noBarrelFile: This is a public API

export { getExpirationTime, isExpired } from "./core/expiration";
export { extractKeyFromHeaders, hasApiKey } from "./core/extract-key";
export {
	hasAllScopes,
	hasAnyScope,
	hasScope,
	// Deprecated — use hasScope/hasAnyScope/hasAllScopes with options.resources
	hasAllScopesWithResources,
	hasAnyScopeWithResources,
	hasScopeWithResources,
} from "./core/scopes";
export type { ScopeCheckOptions } from "./core/scopes";
export { ResourceBuilder, createResourceBuilder } from "./core/resources";
export { generateKey } from "./core/generate";
export type { GenerateKeyOptions } from "./core/generate";
export { hashKey } from "./core/hash";
export type { HashAlgorithm, HashKeyOptions } from "./core/hash";
export { validateKey } from "./core/validate";

export { MemoryCache, RedisCache } from "./core/cache";
export type { Cache, MemoryCacheOptions } from "./core/cache";

export type { ApiKeyManager, VerifyOptions, VerifyResult } from "./manager";
export { createKeys } from "./manager";

export type {
	ApiKeyMetadata,
	ApiKeyMutableFields,
	ApiKeyRecord,
	CreateApiKeyInput,
} from "./types/api-key-types";
export type {
	ActionContext,
	AuditAction,
	AuditLog,
	AuditLogQuery,
	AuditLogStats,
} from "./types/audit-log-types";
export type { Config, ConfigInput } from "./types/config-types";
export type { ApiKeyError } from "./types/error-types";
export { ApiKeyErrorCode, createApiKeyError } from "./types/error-types";
export type { Permission, PermissionScope } from "./types/permissions-types";
export type { Storage, StorageOptions } from "./types/storage-types";
