# better-api-keys

[![CI](https://github.com/izadoesdev/better-api-keys/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/better-api-keys/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/better-api-keys.svg)](https://badge.fury.io/js/better-api-keys)

A TypeScript library for secure API key management with cryptographic hashing, expiration, scopes, and pluggable storage.

## Features

- **Secure by Default**: SHA-256/SHA-512 hashing with optional salt and timing-safe comparison
- **Smart Key Detection**: Automatically extracts keys from `Authorization`, `x-api-key`, or custom headers
- **Built-in Caching**: Optional in-memory or Redis caching for validated keys
- **Flexible Storage**: Memory, Redis, and Drizzle ORM adapters included
- **Scope-based Permissions**: Fine-grained access control
- **Key Management**: Enable/disable, rotate, and soft-revoke keys with audit trails
- **TypeScript**: Full type safety
- **Zero Config**: Works out of the box with sensible defaults

## Installation

```bash
npm install better-api-keys
# or
bun add better-api-keys
```

## Quick Start

```typescript
import { createKeys } from 'better-api-keys'

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
  
  // Header detection
  headerNames: ['x-api-key', 'authorization'],
  extractBearer: true,
})
```

## API

### Creating & Managing Keys

```typescript
// Create
const { key, record } = await keys.create({
  ownerId: 'user_123',
  name: 'Production Key',
  scopes: ['read', 'write'],
  expiresAt: '2025-12-31',
  enabled: true, // optional, defaults to true
})

// List
const userKeys = await keys.list('user_123')

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
})

// Check result
if (result.valid) {
  console.log(result.record)
} else {
  console.log(result.error) // 'Missing API key' | 'Invalid API key' | 'API key has expired' | 'API key is disabled' | 'API key has been revoked'
}
```

### Permission Checking

```typescript
if (keys.hasScope(record, 'write')) { /* ... */ }
if (keys.hasAnyScope(record, ['admin', 'moderator'])) { /* ... */ }
if (keys.hasAllScopes(record, ['read', 'write'])) { /* ... */ }
if (keys.isExpired(record)) { /* ... */ }
```

### Helper Methods

```typescript
keys.hasKey(headers)        // boolean
keys.extractKey(headers)    // string | null
keys.generateKey()          // string
keys.hashKey(key)           // string
```

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
import { DrizzleStore } from 'better-api-keys/storage/drizzle'

const keys = createKeys({
  prefix: 'sk_',
  storage: new DrizzleStore({
    db,
    table: apiKeys,
    columns: {
      keyHash: 'key_hash',
      ownerId: 'user_id',
    }
  })
})
```

### Custom Storage

```typescript
import { type Storage } from 'better-api-keys'

const customStorage: Storage = {
  save: async (record) => { /* ... */ },
  findByHash: async (keyHash) => { /* ... */ },
  findById: async (id) => { /* ... */ },
  findByOwner: async (ownerId) => { /* ... */ },
  updateMetadata: async (id, metadata) => { /* ... */ },
  delete: async (id) => { /* ... */ },
  deleteByOwner: async (ownerId) => { /* ... */ },
}

const keys = createKeys({
  storage: customStorage,
})
```

## Framework Example (Hono)

```typescript
import { Hono } from 'hono'
import { createKeys } from 'better-api-keys'
import Redis from 'ioredis'

const redis = new Redis()

const keys = createKeys({
  prefix: 'sk_',
  storage: 'redis',
  cache: 'redis',
  redis,
})

const app = new Hono()

// Authentication middleware
app.use('/api/*', async (c, next) => {
  const result = await keys.verify(c.req.raw.headers)
  
  if (!result.valid) {
    return c.json({ error: result.error }, 401)
  }

  c.set('apiKey', result.record)
  keys.updateLastUsed(result.record.id).catch(console.error)
  
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
}
```

## License

MIT
