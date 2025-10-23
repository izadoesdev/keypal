// Main exports
export { createKeys, ApiKeyManager, type VerifyResult } from './manager'
export { MemoryStore } from './storage/memory'

// Type exports
export type { Config, ConfigInput } from './types/config-types'
export type { ApiKeyRecord, ApiKeyMetadata, CreateApiKeyInput } from './types/api-key-types'
export type { Storage, StorageOptions, DrizzleColumnMapping } from './types/storage-types'
export type { PermissionScope, Permission, PermissionChecker } from './types/permissions-types'

// Utility exports (optional, available if needed)
export { isExpired, getExpirationTime } from './core/expiration'
export { hasScope, hasAnyScope, hasAllScopes } from './core/scopes'
