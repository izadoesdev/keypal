// Main API
/** biome-ignore-all lint/performance/noBarrelFile: This is a public API */

export { getExpirationTime, isExpired } from "./core/expiration";
export { extractKeyFromHeaders, hasApiKey } from "./core/extract-key";
export { hasAllScopes, hasAnyScope, hasScope } from "./core/scopes";
export {
	ResourceBuilder,
	createResourceBuilder,
} from "./core/resources";
export type { ApiKeyManager, VerifyOptions, VerifyResult } from "./manager";
export { createKeys } from "./manager";
export type {
	ApiKeyMetadata,
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
export type {
	Permission,
	PermissionScope,
} from "./types/permissions-types";
export type { Storage, StorageOptions } from "./types/storage-types";
