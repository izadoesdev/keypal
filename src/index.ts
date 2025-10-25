// Main API
/** biome-ignore-all lint/performance/noBarrelFile: This is a public API */

// Core utilities
export { getExpirationTime, isExpired } from "./core/expiration";
export { extractKeyFromHeaders, hasApiKey } from "./core/extract-key";
export { hasAllScopes, hasAnyScope, hasScope } from "./core/scopes";
export type { ApiKeyManager, VerifyOptions, VerifyResult } from "./manager";
export { createKeys } from "./manager";
// Types
export type {
	ApiKeyMetadata,
	ApiKeyRecord,
	CreateApiKeyInput,
} from "./types/api-key-types";
export type { Config, ConfigInput } from "./types/config-types";
export type { ApiKeyError } from "./types/error-types";
// Error codes and helpers
export { ApiKeyErrorCode, createApiKeyError } from "./types/error-types";
export type {
	Permission,
	PermissionScope,
} from "./types/permissions-types";
export type { Storage, StorageOptions } from "./types/storage-types";
