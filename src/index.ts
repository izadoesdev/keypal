export { createKeys, ApiKeyManager, type VerifyResult, type VerifyOptions } from './manager'
export { MemoryStore } from './storage/memory'
export { DrizzleStore } from './storage/drizzle'
export { MemoryCache, RedisCache, type Cache } from './core/cache'
export { extractKeyFromHeaders, hasApiKey, type KeyExtractionOptions } from './core/extract-key'
export { ResourceBuilder, createResourceBuilder } from './core/resources'

export type { Config, ConfigInput } from './types/config-types'
export type { ApiKeyRecord, ApiKeyMetadata, CreateApiKeyInput } from './types/api-key-types'
export type { Storage, StorageOptions, DrizzleColumnMapping } from './types/storage-types'
export type { PermissionScope, Permission, PermissionChecker } from './types/permissions-types'

export { isExpired, getExpirationTime } from './core/expiration'
export { hasScope, hasAnyScope, hasAllScopes, hasScopeWithResources, hasAnyScopeWithResources, hasAllScopesWithResources, type ScopeCheckOptions } from './core/scopes'
