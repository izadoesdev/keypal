export { createKeys, ApiKeyManager, type VerifyResult } from './manager'
export { MemoryStore } from './storage/memory'

export type { Config, ConfigInput } from './types/config-types'
export type { ApiKeyRecord, ApiKeyMetadata, CreateApiKeyInput } from './types/api-key-types'
export type { Storage, StorageOptions, DrizzleColumnMapping } from './types/storage-types'
export type { PermissionScope, Permission, PermissionChecker } from './types/permissions-types'

export { isExpired, getExpirationTime } from './core/expiration'
export { hasScope, hasAnyScope, hasAllScopes } from './core/scopes'
