# keypal

[![Test](https://github.com/izadoesdev/keypal/actions/workflows/test.yml/badge.svg)](https://github.com/izadoesdev/keypal/actions/workflows/test.yml)
[![Benchmark](https://github.com/izadoesdev/keypal/actions/workflows/benchmark.yml/badge.svg)](https://github.com/izadoesdev/keypal/actions/workflows/benchmark.yml)
[![npm version](https://badge.fury.io/js/keypal.svg)](https://badge.fury.io/js/keypal)

A TypeScript library for secure API key management with cryptographic hashing, expiration, scopes, and pluggable storage.

## Features

- **Secure by Default**: SHA-256/SHA-512 hashing with optional salt and timing-safe comparison
- **Smart Key Detection**: Automatically extracts keys from `Authorization`, `x-api-key`, or custom headers
- **Built-in Caching**: Optional in-memory or Redis caching for validated keys
- **Flexible Storage**: Memory, Redis, Drizzle ORM, Prisma, and Kysely adapters included
- **Scope-based Permissions**: Fine-grained access control with resource-specific scopes
- **Tags**: Organize and find keys by tags
- **Key Management**: Enable/disable, rotate, and soft-revoke keys with audit trails
- **Audit Logging**: Track who did what, when, and why (opt-in)
- **TypeScript**: Full type safety
- **Zero Config**: Works out of the box with sensible defaults

## Installation

```bash
npm install keypal
# or
bun add keypal
```

## Quick Start

```typescript
import { createKeys } from 'keypal'

const keys = createKeys({
  prefix: 'sk_',
  cache: true,
})

// Create a key
const { key, record } = await keys.create({
  ownerId: 'user_123',
  scopes: ['read', 'write'],
})

// Verify from headers
const result = await keys.verify(request.headers)
if (result.valid) {
  console.log('Authenticated:', result.record.metadata.ownerId)
}
```

## Configuration

```typescript
import Redis from 'ioredis'

const redis = new Redis()

const keys = createKeys({
  // Key generation
  prefix: 'sk_prod_',
  length: 32,
  alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  
  // Security
  algorithm: 'sha256',  // or 'sha512'
  salt: process.env.API_KEY_SALT,
  
  // Storage (memory by default)
  storage: 'redis',  // or custom Storage instance
  redis,             // required when storage/cache is 'redis'
  
  // Caching
  cache: true,       // in-memory cache
  // cache: 'redis', // Redis cache
  cacheTtl: 60,
  
  // Revocation
  revokedKeyTtl: 604800, // TTL for revoked keys in Redis (7 days), set to 0 to keep forever
  
  // Usage tracking
  autoTrackUsage: true, // Automatically update lastUsedAt on verify
  
  // Audit logging (opt-in)
  auditLogs: true,  // Enable audit logging
  auditContext: {   // Default context for all audit logs (optional)
    userId: 'system',
    metadata: { service: 'api' }
  },
  
  // Header detection
  headerNames: ['x-api-key', 'authorization'],
  extractBearer: true,
})
```

## API

### Creating & Managing Keys

```typescript
// Create with plain object
const { key, record } = await keys.create({
  ownerId: 'user_123',
  name: 'Production Key',
  description: 'Key for production API access',
  scopes: ['read', 'write'],
  tags: ['production', 'api'],
  resources: {
    'project:123': ['read', 'write'],
    'project:456': ['read']
  },
  expiresAt: '2025-12-31',
  enabled: true, // optional, defaults to true
})

// Create with ResourceBuilder (fluent API)
import { ResourceBuilder, createResourceBuilder } from 'keypal'

const resources = new ResourceBuilder()
  .add('website', 'site123', ['read', 'write'])
  .add('project', 'proj456', ['deploy'])
  .addMany('website', ['site1', 'site2', 'site3'], ['read']) // Same scopes for multiple resources
  .build()

const { key: key2, record: record2 } = await keys.create({
  ownerId: 'user_123',
  scopes: ['admin'],
  resources, // Use the built resources object
})

// List
const userKeys = await keys.list('user_123')

// Find by tag
const taggedKeys = await keys.findByTag('production')
const multiTagKeys = await keys.findByTags(['production', 'api'])

// Find by ID or hash
const keyRecord = await keys.findById(record.id)
const keyByHash = await keys.findByHash(record.keyHash)

// Enable/Disable
await keys.enable(record.id)
await keys.disable(record.id)

// Rotate (create new key, mark old as revoked)
const { key: newKey, record: newRecord, oldRecord } = await keys.rotate(record.id, {
  name: 'Updated Key',
  scopes: ['read', 'write', 'admin'],
})

// Revoke (soft delete - keeps record with revokedAt timestamp)
await keys.revoke(record.id)
await keys.revokeAll('user_123')

// Update last used
await keys.updateLastUsed(record.id)
```

### Verifying Keys

```typescript
// From headers (automatic detection)
const result = await keys.verify(request.headers)

// From string
const result = await keys.verify('sk_abc123')
const result = await keys.verify('Bearer sk_abc123')

// With options
const result = await keys.verify(headers, {
  headerNames: ['x-custom-key'],
  skipCache: true,
  skipTracking: true, // Skip updating lastUsedAt (useful when autoTrackUsage is enabled)
})

// Check result
if (result.valid) {
  console.log(result.record)
} else {
  console.log(result.error) // Human-readable error message
  console.log(result.errorCode) // Error code for programmatic handling (see ApiKeyErrorCode)
}
```

### Permission Checking

```typescript
// Global scope checks
if (keys.hasScope(record, 'write')) { /* ... */ }
if (keys.hasAnyScope(record, ['admin', 'moderator'])) { /* ... */ }
if (keys.hasAllScopes(record, ['read', 'write'])) { /* ... */ }
if (keys.isExpired(record)) { /* ... */ }

// Resource-specific scope checks
// Check if key has 'read' scope for a specific resource
if (keys.checkResourceScope(record, 'website', 'site123', 'read')) { /* ... */ }

// Check if key has any of the specified scopes for a resource
if (keys.checkResourceAnyScope(record, 'website', 'site123', ['admin', 'write'])) { /* ... */ }

// Check if key has all specified scopes for a resource (checks both global and resource scopes)
if (keys.checkResourceAllScopes(record, 'website', 'site123', ['read', 'write'])) { /* ... */ }
```

### ResourceBuilder (Fluent API)

Build resource-specific scopes with a clean, chainable API:

```typescript
import { ResourceBuilder, createResourceBuilder } from 'keypal'

// Basic usage
const resources = new ResourceBuilder()
  .add('website', 'site123', ['read', 'write'])
  .add('project', 'proj456', ['deploy'])
  .build()

// Add scopes to multiple resources at once
const resources2 = new ResourceBuilder()
  .addMany('website', ['site1', 'site2', 'site3'], ['read'])
  .add('project', 'proj1', ['deploy', 'rollback'])
  .build()

// Add single scopes
const resources3 = new ResourceBuilder()
  .addOne('website', 'site123', 'read')
  .addOne('website', 'site123', 'write')
  .build()

// Modify existing resources
const builder = new ResourceBuilder()
  .add('website', 'site123', ['read', 'write'])
  .add('project', 'proj456', ['deploy'])

// Check if resource exists
if (builder.has('website', 'site123')) {
  const scopes = builder.get('website', 'site123')
  console.log(scopes) // ['read', 'write']
}

// Remove specific scopes
builder.removeScopes('website', 'site123', ['write'])

// Remove entire resource
builder.remove('project', 'proj456')

// Build final result
const finalResources = builder.build()

// Start from existing resources (useful for updates)
const existingResources = {
  'website:site123': ['read'],
  'project:proj456': ['deploy']
}

const updated = ResourceBuilder.from(existingResources)
  .add('website', 'site123', ['write']) // Merges with existing
  .add('team', 'team789', ['admin'])
  .build()

// Use with createKeys
await keys.create({
  ownerId: 'user_123',
  scopes: ['admin'],
  resources: updated
})
```

**ResourceBuilder Methods:**
- `add(resourceType, resourceId, scopes)` - Add scopes to a resource (merges if exists)
- `addOne(resourceType, resourceId, scope)` - Add a single scope
- `addMany(resourceType, resourceIds, scopes)` - Add same scopes to multiple resources
- `remove(resourceType, resourceId)` - Remove entire resource
- `removeScopes(resourceType, resourceId, scopes)` - Remove specific scopes
- `has(resourceType, resourceId)` - Check if resource exists
- `get(resourceType, resourceId)` - Get scopes for a resource
- `clear()` - Clear all resources
- `build()` - Build and return the resources object
- `ResourceBuilder.from(resources)` - Create from existing resources object

### Usage Tracking

```typescript
// Enable automatic tracking in config
const keys = createKeys({
  autoTrackUsage: true, // Automatically updates lastUsedAt on verify
})

// Manually update (always available)
await keys.updateLastUsed(record.id)

// Skip tracking for specific requests
const result = await keys.verify(headers, { skipTracking: true })
```

### Audit Logging

Track all key operations with context about who performed each action:

```typescript
// Enable audit logging
const keys = createKeys({
  auditLogs: true,
  auditContext: {
    // Default context merged into all logs
    metadata: { environment: 'production' }
  }
})

// Actions are automatically logged with optional context
await keys.create({
  ownerId: 'user_123',
  scopes: ['read']
}, {
  userId: 'admin_456',
  ip: '192.168.1.1',
  metadata: { reason: 'New customer onboarding' }
})

await keys.revoke('key_123', {
  userId: 'admin_789',
  metadata: { reason: 'Security breach' }
})

// Query logs
const logs = await keys.getLogs({
  keyId: 'key_123',
  action: 'revoked',
  startDate: '2025-01-01',
  limit: 100
})

// Count logs
const count = await keys.countLogs({ action: 'created' })

// Get statistics
const stats = await keys.getLogStats('user_123')
console.log(stats.total)
console.log(stats.byAction.created)
console.log(stats.lastActivity)

// Clean up old logs
const deleted = await keys.deleteLogs({
  endDate: '2024-01-01'
})

// Clear logs for a specific key
await keys.clearLogs('key_123')
```

**Log Entry Structure:**

```typescript
{
  id: 'log_xyz',
  action: 'created' | 'revoked' | 'rotated' | 'enabled' | 'disabled',
  keyId: 'key_123',
  ownerId: 'user_456',
  timestamp: '2025-10-25T12:00:00.000Z',
  data: {
    userId: 'admin_789',
    ip: '192.168.1.1',
    metadata: { reason: 'Security breach' }
  }
}
```

### Helper Methods

```typescript
keys.hasKey(headers)              // boolean - check if headers contain an API key
keys.extractKey(headers)          // string | null - extract key from headers
keys.generateKey()                // string - generate a new key (without saving)
keys.hashKey(key)                 // string - hash a key (useful for custom storage)
keys.invalidateCache(keyHash)     // Promise<void> - manually invalidate cached key
```

### Standalone Utility Functions

You can also use these functions without a manager instance:

```typescript
import { 
  isExpired, 
  getExpirationTime,
  extractKeyFromHeaders,
  hasApiKey,
  hasScope,
  hasAnyScope,
  hasAllScopes,
  ApiKeyErrorCode,
  createApiKeyError
} from 'keypal'

// Check expiration
const expired = isExpired('2025-12-31T00:00:00.000Z')
const expirationDate = getExpirationTime('2025-12-31T00:00:00.000Z') // Date | null

// Extract key from headers
const key = extractKeyFromHeaders(request.headers, {
  headerNames: ['x-api-key'],
  extractBearer: true
})

// Check if headers have API key
if (hasApiKey(request.headers)) {
  const key = extractKeyFromHeaders(request.headers)
}

// Check scopes (for plain scope arrays, not records)
const hasWrite = hasScope(['read', 'write'], 'write')
const hasAny = hasAnyScope(['read', 'write'], ['admin', 'write'])
const hasAll = hasAllScopes(['read', 'write'], ['read', 'write'])

// Error handling
if (!result.valid) {
  switch (result.errorCode) {
    case ApiKeyErrorCode.EXPIRED:
      // Handle expired key
      break
    case ApiKeyErrorCode.REVOKED:
      // Handle revoked key
      break
    case ApiKeyErrorCode.DISABLED:
      // Handle disabled key
      break
    // ... other error codes
  }
}

// Create custom errors
const error = createApiKeyError(ApiKeyErrorCode.INVALID_KEY, {
  attemptedKey: 'sk_abc123'
})
```

**Available Error Codes:**
- `MISSING_KEY` - No API key provided
- `INVALID_FORMAT` - API key format is invalid
- `INVALID_KEY` - API key does not exist
- `EXPIRED` - API key has expired
- `REVOKED` - API key has been revoked
- `DISABLED` - API key is disabled
- `STORAGE_ERROR` - Storage operation failed
- `CACHE_ERROR` - Cache operation failed
- `ALREADY_REVOKED` - Key is already revoked
- `ALREADY_ENABLED` - Key is already enabled
- `ALREADY_DISABLED` - Key is already disabled
- `CANNOT_MODIFY_REVOKED` - Cannot modify revoked key
- `KEY_NOT_FOUND` - API key not found
- `AUDIT_LOGGING_DISABLED` - Audit logging not enabled
- `STORAGE_NOT_SUPPORTED` - Storage doesn't support operation

## Storage Examples

### Memory (Default)

```typescript
const keys = createKeys({ prefix: 'sk_' })
```

### Redis

```typescript
import Redis from 'ioredis'

const redis = new Redis()

const keys = createKeys({
  prefix: 'sk_',
  storage: 'redis',
  cache: 'redis',
  redis,
})
```

### Drizzle ORM

```typescript
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { DrizzleStore } from 'keypal/drizzle'
import { apikey } from 'keypal/drizzle/schema'
import { createKeys } from 'keypal'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
})

const db = drizzle(pool, { schema: { apikey } })

const keys = createKeys({
  prefix: 'sk_prod_',
  storage: new DrizzleStore({ db, table: apikey }),
  cache: true,
})
```

**Setup Database Schema:**

```typescript
// src/drizzle/schema.ts
import { index, jsonb, pgTable, text, unique } from 'drizzle-orm/pg-core'

export const apikey = pgTable(
  'apikey',
  {
    id: text().primaryKey().notNull(),
    keyHash: text('key_hash').notNull(),
    metadata: jsonb('metadata').notNull(),
  },
  (table) => [
    index('apikey_key_hash_idx').on(table.keyHash),
    unique('apikey_key_hash_unique').on(table.keyHash),
  ]
)
```

**Generate migrations:**

```bash
bun run db:generate
bun run db:push
```

**Use Drizzle Studio:**

```bash
bun run studio
```

### Prisma

```typescript
import { PrismaClient } from '@prisma/client'
import { PrismaStore } from 'keypal/prisma'
import { createKeys } from 'keypal'

const prisma = new PrismaClient()

const keys = createKeys({
  prefix: 'sk_prod_',
  storage: new PrismaStore({ prisma, model: 'apiKey' }),
  cache: true,
})
```

**Setup Prisma Schema:**

```prisma
model ApiKey {
  id       String @id @default(cuid())
  keyHash  String @unique
  metadata Json

  @@index([keyHash])
  @@map("api_keys")
}
```

### Kysely

```typescript
import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'
import { KyselyStore } from 'keypal/kysely'
import { createKeys } from 'keypal'

const db = new Kysely({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.DATABASE_URL
    })
  })
})

const keys = createKeys({
  prefix: 'sk_prod_',
  storage: new KyselyStore({ db, tableName: 'api_keys' }),
  cache: true,
})
```

**Setup Database Schema:**

```sql
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT UNIQUE NOT NULL,
  metadata JSONB NOT NULL
);

CREATE INDEX api_keys_key_hash_idx ON api_keys(key_hash);
```

### Custom Storage

```typescript
import { type Storage } from 'keypal'

const customStorage: Storage = {
  save: async (record) => { /* ... */ },
  findByHash: async (keyHash) => { /* ... */ },
  findById: async (id) => { /* ... */ },
  findByOwner: async (ownerId) => { /* ... */ },
  findByTag: async (tag, ownerId) => { /* ... */ },
  findByTags: async (tags, ownerId) => { /* ... */ },
  updateMetadata: async (id, metadata) => { /* ... */ },
  delete: async (id) => { /* ... */ },
  deleteByOwner: async (ownerId) => { /* ... */ },
}

const keys = createKeys({
  storage: customStorage,
})
```

## Error Handling Best Practices

### Comprehensive Error Handling

```typescript
import { createKeys, ApiKeyErrorCode } from 'keypal'

const keys = createKeys({
  prefix: 'sk_',
  storage: 'redis',
  redis,
})

// Verify with comprehensive error handling
const result = await keys.verify(request.headers)

if (!result.valid) {
  switch (result.errorCode) {
    case ApiKeyErrorCode.MISSING_KEY:
      return { error: 'API key is required', statusCode: 401 }
    
    case ApiKeyErrorCode.INVALID_FORMAT:
      return { error: 'Invalid API key format', statusCode: 401 }
    
    case ApiKeyErrorCode.INVALID_KEY:
      return { error: 'Invalid API key', statusCode: 401 }
    
    case ApiKeyErrorCode.EXPIRED:
      return { error: 'API key has expired', statusCode: 401 }
    
    case ApiKeyErrorCode.REVOKED:
      return { error: 'API key has been revoked', statusCode: 401 }
    
    case ApiKeyErrorCode.DISABLED:
      return { error: 'API key is disabled', statusCode: 403 }
    
    default:
      return { error: 'Authentication failed', statusCode: 401 }
  }
}

// Key is valid, proceed with request
console.log('Authenticated user:', result.record.metadata.ownerId)
```

### Handling Storage Errors

```typescript
import { createKeys, createApiKeyError, ApiKeyErrorCode } from 'keypal'

try {
  // Create a key
  const { key, record } = await keys.create({
    ownerId: 'user_123',
    scopes: ['read', 'write'],
  })
  
  return { success: true, key, keyId: record.id }
} catch (error) {
  console.error('Failed to create API key:', error)
  
  // Handle specific error types
  if (error instanceof Error) {
    if (error.message.includes('duplicate')) {
      return { success: false, error: 'Duplicate key detected' }
    }
    if (error.message.includes('connection')) {
      return { success: false, error: 'Database connection failed' }
    }
  }
  
  return { success: false, error: 'Failed to create API key' }
}
```

### Handling Key Operations

```typescript
// Revoke with error handling
try {
  await keys.revoke(keyId, {
    userId: 'admin_123',
    metadata: { reason: 'User request' }
  })
} catch (error) {
  if (error.code === ApiKeyErrorCode.KEY_NOT_FOUND) {
    return { error: 'Key not found', statusCode: 404 }
  }
  if (error.code === ApiKeyErrorCode.ALREADY_REVOKED) {
    return { error: 'Key is already revoked', statusCode: 400 }
  }
  throw error // Re-throw unexpected errors
}

// Enable/Disable with error handling
try {
  await keys.enable(keyId)
} catch (error) {
  if (error.code === ApiKeyErrorCode.KEY_NOT_FOUND) {
    return { error: 'Key not found', statusCode: 404 }
  }
  if (error.code === ApiKeyErrorCode.ALREADY_ENABLED) {
    return { message: 'Key was already enabled', statusCode: 200 }
  }
  if (error.code === ApiKeyErrorCode.CANNOT_MODIFY_REVOKED) {
    return { error: 'Cannot enable a revoked key', statusCode: 400 }
  }
  throw error
}

// Rotate with error handling
try {
  const { key: newKey, record, oldRecord } = await keys.rotate(keyId, {
    scopes: ['read', 'write', 'admin'],
  })
  return { success: true, key: newKey, keyId: record.id }
} catch (error) {
  if (error.code === ApiKeyErrorCode.KEY_NOT_FOUND) {
    return { error: 'Key not found', statusCode: 404 }
  }
  if (error.code === ApiKeyErrorCode.CANNOT_MODIFY_REVOKED) {
    return { error: 'Cannot rotate a revoked key', statusCode: 400 }
  }
  throw error
}
```

### Drizzle Storage Error Handling

```typescript
import { DrizzleStore } from 'keypal/drizzle'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { apikey } from 'keypal/drizzle/schema'

// Initialize with connection error handling
let pool: Pool
let store: DrizzleStore

try {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Connection pool settings
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  })

  // Test connection
  await pool.query('SELECT 1')
  
  const db = drizzle(pool, { schema: { apikey } })
  store = new DrizzleStore({ db, table: apikey })
  
  console.log('Database connection established')
} catch (error) {
  console.error('Failed to connect to database:', error)
  throw new Error('Database initialization failed')
}

const keys = createKeys({
  prefix: 'sk_',
  storage: store,
  cache: true,
})

// Update metadata with error handling
try {
  await store.updateMetadata(keyId, {
    name: 'Updated Key',
    scopes: ['admin'],
  })
} catch (error) {
  if (error.message.includes('not found')) {
    return { error: 'Key not found', statusCode: 404 }
  }
  console.error('Failed to update key metadata:', error)
  throw error
}

// Handle duplicate key errors
try {
  await keys.create({
    ownerId: 'user_123',
    name: 'My Key',
  })
} catch (error) {
  // PostgreSQL duplicate key error
  if (error.code === '23505') {
    return { error: 'Duplicate key detected', statusCode: 409 }
  }
  throw error
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  await pool.end()
  console.log('Database connection closed')
})
```

## Framework Example (Hono)

```typescript
import { Hono } from 'hono'
import { createKeys, ApiKeyErrorCode } from 'keypal'
import Redis from 'ioredis'

const redis = new Redis()

const keys = createKeys({
  prefix: 'sk_',
  storage: 'redis',
  cache: 'redis',
  redis,
  auditLogs: true,
})

const app = new Hono()

// Authentication middleware with comprehensive error handling
app.use('/api/*', async (c, next) => {
  const result = await keys.verify(c.req.raw.headers)
  
  if (!result.valid) {
    // Log failed authentication attempts
    console.warn('Authentication failed:', {
      error: result.error,
      errorCode: result.errorCode,
      path: c.req.path,
      ip: c.req.header('x-forwarded-for'),
    })
    
    // Return appropriate error response
    const statusCode = result.errorCode === ApiKeyErrorCode.DISABLED ? 403 : 401
    return c.json({ error: result.error, code: result.errorCode }, statusCode)
  }

  // Store record in context for downstream handlers
  c.set('apiKey', result.record)
  
  // Track usage (fire and forget)
  if (result.record) {
    keys.updateLastUsed(result.record.id).catch((err) => {
      console.error('Failed to update lastUsedAt:', err)
    })
  }
  
  await next()
})

// Protected route with scope check
app.get('/api/data', async (c) => {
  const record = c.get('apiKey')
  
  if (!keys.hasScope(record, 'read')) {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }

  return c.json({ data: 'sensitive data' })
})

// Resource-specific scope check
app.get('/api/projects/:id', async (c) => {
  const record = c.get('apiKey')
  const projectId = c.req.param('id')
  
  // Check if key has read scope for this specific project
  if (!keys.checkResourceScope(record, 'project', projectId, 'read')) {
    return c.json({ error: 'No access to this project' }, 403)
  }

  return c.json({ project: { id: projectId } })
})

// Create API key endpoint
app.post('/api/keys', async (c) => {
  const record = c.get('apiKey')
  
  // Only admins can create keys
  if (!keys.hasScope(record, 'admin')) {
    return c.json({ error: 'Admin permission required' }, 403)
  }
  
  try {
    const body = await c.req.json()
    
    const { key, record: newRecord } = await keys.create({
      ownerId: body.ownerId,
      name: body.name,
      scopes: body.scopes,
      expiresAt: body.expiresAt,
    }, {
      userId: record.metadata.ownerId,
      ip: c.req.header('x-forwarded-for'),
      metadata: { action: 'api_create' },
    })
    
    return c.json({ 
      success: true, 
      key,  // Only returned once!
      keyId: newRecord.id 
    })
  } catch (error) {
    console.error('Failed to create key:', error)
    return c.json({ error: 'Failed to create key' }, 500)
  }
})

// Revoke API key endpoint
app.delete('/api/keys/:id', async (c) => {
  const record = c.get('apiKey')
  const keyId = c.req.param('id')
  
  try {
    // Verify ownership or admin permission
    const keyToRevoke = await keys.findById(keyId)
    
    if (!keyToRevoke) {
      return c.json({ error: 'Key not found' }, 404)
    }
    
    const isOwner = keyToRevoke.metadata.ownerId === record.metadata.ownerId
    const isAdmin = keys.hasScope(record, 'admin')
    
    if (!isOwner && !isAdmin) {
      return c.json({ error: 'Not authorized' }, 403)
    }
    
    await keys.revoke(keyId, {
      userId: record.metadata.ownerId,
      ip: c.req.header('x-forwarded-for'),
      metadata: { via: 'api' },
    })
    
    return c.json({ success: true })
  } catch (error) {
    if (error.code === ApiKeyErrorCode.KEY_NOT_FOUND) {
      return c.json({ error: 'Key not found' }, 404)
    }
    if (error.code === ApiKeyErrorCode.ALREADY_REVOKED) {
      return c.json({ error: 'Key is already revoked' }, 400)
    }
    
    console.error('Failed to revoke key:', error)
    return c.json({ error: 'Failed to revoke key' }, 500)
  }
})
```

## Security Best Practices

1. **Use a salt in production**:
   ```typescript
   const keys = createKeys({
     salt: process.env.API_KEY_SALT,
     algorithm: 'sha512',
   })
   ```

2. **Set expiration dates**: Don't create keys that never expire

3. **Use scopes**: Implement least-privilege access

4. **Enable caching**: Reduce database load in production

5. **Use HTTPS**: Always use HTTPS to prevent key interception

6. **Monitor usage**: Track `lastUsedAt` to identify unused keys

7. **Rotate keys**: Implement regular key rotation policies
   ```typescript
   // Rotate keys periodically
   const { key: newKey } = await keys.rotate(oldRecord.id)
   ```

8. **Use soft revocation**: Revoked keys are kept with `revokedAt` timestamp for audit trails (Redis TTL: 7 days, Drizzle: forever)

9. **Enable/Disable rather than revoke**: Temporarily disable keys instead of revoking them

## TypeScript Types

```typescript
interface ApiKeyRecord {
  id: string
  keyHash: string
  metadata: ApiKeyMetadata
}

interface ApiKeyMetadata {
  ownerId: string
  name?: string
  description?: string
  scopes?: string[]
  resources?: Record<string, string[]> // Resource-specific scopes (e.g., { "project:123": ["read", "write"] })
  tags?: string[]
  expiresAt: string | null
  createdAt?: string
  lastUsedAt?: string
  enabled?: boolean
  revokedAt?: string | null
  rotatedTo?: string | null
}

interface VerifyResult {
  valid: boolean
  record?: ApiKeyRecord
  error?: string
  errorCode?: ApiKeyErrorCode
}
```

## License

MIT
