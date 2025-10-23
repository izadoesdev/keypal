# better-api-keys

A TypeScript library for managing API keys with cryptographic hashing, expiration, scopes, and pluggable storage backends.

## Features

- **Secure by default**: Uses cryptographic hashing (SHA-256/SHA-512) and timing-safe comparison
- **Simple API**: Streamlined methods for creating, verifying, and managing keys
- **Flexible storage**: Built-in support for Memory, Redis, and Drizzle ORM
- **Scope-based permissions**: Fine-grained access control
- **Key expiration**: Automatic expiration checking
- **TypeScript**: Full type safety throughout
- **Zero config**: Works out of the box with sensible defaults

## Installation

```bash
npm install better-api-keys
# or
bun add better-api-keys
```

## Quick Start

```typescript
import { createKeys } from 'better-api-keys'

// Initialize with default in-memory storage
const keys = createKeys({ prefix: 'sk_' })

// Create a new API key
const { key, record } = await keys.create({
  ownerId: 'user_123',
  name: 'Production Key',
  scopes: ['read', 'write'],
})

console.log('Generated key:', key) // sk_...

// Verify a key
const result = await keys.verify(key)
if (result.valid) {
  console.log('Authenticated as:', result.record.metadata.ownerId)
}
```

## Configuration

```typescript
import { createKeys } from 'better-api-keys'

const keys = createKeys({
  prefix: 'sk_prod_',           // Optional: prefix for generated keys
  length: 32,                   // Optional: length of random portion (default: 32)
  algorithm: 'sha256',          // Optional: 'sha256' or 'sha512' (default: 'sha256')
  alphabet: 'ABC...xyz123',     // Optional: custom alphabet for key generation
  salt: 'your-secret-salt',     // Optional: salt for additional hashing security
})
```

### Custom Alphabet

You can specify a custom alphabet for key generation:

```typescript
// Only uppercase letters and numbers
const keys = createKeys({
  prefix: 'KEY_',
  alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
})

// URL-safe characters only
const keys = createKeys({
  alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
})
```

### Salt for Enhanced Security

Adding a salt provides an additional layer of security:

```typescript
const keys = createKeys({
  prefix: 'sk_',
  salt: process.env.API_KEY_SALT, // Keep this secret!
  algorithm: 'sha512',
})
```

**Important:** If you use a salt, you must use the same salt for all operations. Store it securely (environment variable, secrets manager).

## API Reference

### Creating Keys

```typescript
// Create a key with metadata
const { key, record } = await keys.create({
  ownerId: 'user_123',           // Required: who owns this key
  name: 'Production Key',        // Optional: human-readable name
  description: 'API access',     // Optional: description
  scopes: ['read', 'write'],     // Optional: permissions
  expiresAt: '2025-12-31',       // Optional: expiration date (ISO string)
})
```

### Verifying Keys

```typescript
// Single-step verification (handles Bearer tokens automatically)
const result = await keys.verify(authHeader)

if (result.valid) {
  console.log('Owner:', result.record.metadata.ownerId)
  console.log('Scopes:', result.record.metadata.scopes)
} else {
  console.log('Error:', result.error)
}
```

### Managing Keys

```typescript
// List all keys for a user
const userKeys = await keys.list('user_123')

// Find by ID
const record = await keys.findById('key_id')

// Update last used timestamp
await keys.updateLastUsed('key_id')

// Revoke a single key
await keys.revoke('key_id')

// Revoke all keys for a user
await keys.revokeAll('user_123')
```

### Checking Scopes

```typescript
const record = await keys.findById('key_id')

// Check single scope
if (keys.hasScope(record, 'admin')) {
  // Has admin access
}

// Check if has any of the scopes
if (keys.hasAnyScope(record, ['read', 'write'])) {
  // Has either read or write
}

// Check if has all scopes
if (keys.hasAllScopes(record, ['read', 'write'])) {
  // Has both read and write
}
```

### Checking Expiration

```typescript
const record = await keys.findById('key_id')

if (keys.isExpired(record)) {
  console.log('Key has expired')
}
```

## Storage Options

### Memory Storage (Default)

Perfect for development and testing.

```typescript
import { createKeys } from 'better-api-keys'

const keys = createKeys({ prefix: 'sk_' })
// MemoryStore is used by default
```

### Redis Storage

For production use with Redis.

```typescript
import { createKeys } from 'better-api-keys'
import { RedisStore } from 'better-api-keys/storage/redis'
import Redis from 'ioredis'

const redis = new Redis({
  host: 'localhost',
  port: 6379,
})

const keys = createKeys(
  { prefix: 'sk_' },
  new RedisStore({ client: redis })
)
```

### Drizzle Storage

Works with your existing database schema using Drizzle ORM.

```typescript
import { createKeys } from 'better-api-keys'
import { DrizzleStore } from 'better-api-keys/storage/drizzle'
import { drizzle } from 'drizzle-orm/node-postgres'
import { pgTable, text } from 'drizzle-orm/pg-core'

// Define your table (use any column names)
const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey(),
  keyHash: text('key_hash').notNull(),
  ownerId: text('owner_id').notNull(),
  name: text('name'),
  description: text('description'),
  scopes: text('scopes'),
  expiresAt: text('expires_at'),
  createdAt: text('created_at'),
  lastUsedAt: text('last_used_at'),
})

const db = drizzle(pool)

const keys = createKeys(
  { prefix: 'sk_' },
  new DrizzleStore({
    db,
    table: apiKeys,
    columns: {
      keyHash: 'key_hash',
      ownerId: 'owner_id',
      expiresAt: 'expires_at',
      createdAt: 'created_at',
      lastUsedAt: 'last_used_at',
    },
  })
)
```

The Drizzle adapter works with any existing schema. Just map your column names to the library's fields.

## Example: Hono API

```typescript
import { Hono } from 'hono'
import { createKeys, type ApiKeyRecord } from 'better-api-keys'

const keys = createKeys({ prefix: 'sk_' })
const app = new Hono<{ Variables: { keyRecord: ApiKeyRecord } }>()

// Middleware
const requireAuth = async (c, next) => {
  const result = await keys.verify(c.req.header('Authorization') || '')
  
  if (!result.valid || !result.record) {
    return c.json({ error: result.error }, 401)
  }
  
  c.set('keyRecord', result.record)
  await next()
}

// Create key
app.post('/keys', async (c) => {
  const body = await c.req.json()
  const { key, record } = await keys.create({
    ownerId: body.ownerId,
    scopes: body.scopes,
  })
  return c.json({ key, id: record.id }, 201)
})

// Protected route
app.get('/protected', requireAuth, (c) => {
  const record = c.get('keyRecord')
  return c.json({
    message: 'Authenticated',
    owner: record.metadata.ownerId,
  })
})

// Admin-only route
app.get('/admin', requireAuth, (c) => {
  const record = c.get('keyRecord')
  
  if (!keys.hasScope(record, 'admin')) {
    return c.json({ error: 'Admin access required' }, 403)
  }
  
  return c.json({ message: 'Admin access granted' })
})

export default app
```

## Testing

```bash
# Run all tests
npm test

# Run with UI
npm run test:ui

# Run specific storage tests
npm run test:redis      # Requires Redis running
npm run test:drizzle
```

## Development

```bash
# Build
npm run build

# Run example
npm run example:hono

# Start Redis (for testing)
npm run redis:up
npm run redis:down
```

## TypeScript

Full TypeScript support with exported types:

```typescript
import type {
  ApiKeyRecord,
  ApiKeyMetadata,
  VerifyResult,
  Storage,
  Config,
  ConfigInput,
  PermissionScope,
} from 'better-api-keys'
```

## Security Notes

- API keys are hashed before storage using SHA-256 or SHA-512
- Validation uses timing-safe comparison to prevent timing attacks
- Keys are generated using cryptographically secure random bytes from `nanoid`
- Optional salt support for additional hashing security
- Custom alphabet support for specialized key formats
- The plain-text key is only returned once during creation
- Store keys securely on the client side (environment variables, secure vaults)

### Best Practices

1. **Use a salt in production**: Add a secret salt to your configuration
2. **Keep salt secret**: Store salt in environment variables or secrets manager
3. **Use SHA-512 for high-security applications**: More secure than SHA-256
4. **Rotate keys regularly**: Implement key rotation policies
5. **Set expiration dates**: Don't create keys that never expire
6. **Monitor usage**: Track `lastUsedAt` to identify unused keys

## License

MIT

