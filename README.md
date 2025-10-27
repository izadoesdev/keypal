# keypal

[![Test](https://github.com/izadoesdev/keypal/actions/workflows/test.yml/badge.svg)](https://github.com/izadoesdev/keypal/actions/workflows/test.yml)
[![Benchmark](https://github.com/izadoesdev/keypal/actions/workflows/benchmark.yml/badge.svg)](https://github.com/izadoesdev/keypal/actions/workflows/benchmark.yml)
[![npm version](https://badge.fury.io/js/keypal.svg)](https://badge.fury.io/js/keypal)

A TypeScript library for secure API key management with cryptographic hashing, expiration, scopes, and pluggable storage.

## Features

- **Secure by Default**: SHA-256/SHA-512 hashing with optional salt and timing-safe comparison
- **Smart Key Detection**: Automatically extracts keys from `Authorization`, `x-api-key`, or custom headers
- **Built-in Caching**: Optional in-memory or Redis caching for validated keys
- **Rate Limiting**: Optional automatic rate limiting on verify calls with atomic counters
- **Flexible Storage**: Memory, Redis, and Drizzle ORM adapters included
- **Scope-based Permissions**: Fine-grained access control
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
import { createKeys } from "keypal";

const keys = createKeys({
  prefix: "sk_",
  cache: true,
});

// Create a key
const { key, record } = await keys.create({
  ownerId: "user_123",
  scopes: ["read", "write"],
});

// Verify from headers
const result = await keys.verify(request.headers);
if (result.valid) {
  console.log("Authenticated:", result.record.metadata.ownerId);
}
```

## Configuration

```typescript
import Redis from "ioredis";

const redis = new Redis();

const keys = createKeys({
  // Key generation
  prefix: "sk_prod_",
  length: 32,
  alphabet: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",

  // Security
  algorithm: "sha256", // or 'sha512'
  salt: process.env.API_KEY_SALT,

  // Storage (memory by default)
  storage: "redis", // or custom Storage instance
  redis, // required when storage/cache is 'redis'

  // Caching
  cache: true, // in-memory cache
  // cache: 'redis', // Redis cache
  cacheTtl: 60,

  // Revocation
  revokedKeyTtl: 604800, // TTL for revoked keys in Redis (7 days), set to 0 to keep forever

  // Usage tracking
  autoTrackUsage: true, // Automatically update lastUsedAt on verify

  // Rate limiting (opt-in, requires cache)
  rateLimit: {
    maxRequests: 100,
    windowMs: 60_000, // 1 minute window
  },

  // Audit logging (opt-in)
  auditLogs: true, // Enable audit logging
  auditContext: {
    // Default context for all audit logs (optional)
    userId: "system",
    metadata: { service: "api" },
  },

  // Header detection
  headerNames: ["x-api-key", "authorization"],
  extractBearer: true,
});
```

## API

### Creating & Managing Keys

```typescript
// Create
const { key, record } = await keys.create({
  ownerId: "user_123",
  name: "Production Key",
  scopes: ["read", "write"],
  expiresAt: "2025-12-31",
  enabled: true, // optional, defaults to true
});

// List
const userKeys = await keys.list("user_123");

// Enable/Disable
await keys.enable(record.id);
await keys.disable(record.id);

// Rotate (create new key, mark old as revoked)
const {
  key: newKey,
  record: newRecord,
  oldRecord,
} = await keys.rotate(record.id, {
  name: "Updated Key",
  scopes: ["read", "write", "admin"],
});

// Revoke (soft delete - keeps record with revokedAt timestamp)
await keys.revoke(record.id);
await keys.revokeAll("user_123");

// Update last used
await keys.updateLastUsed(record.id);
```

### Verifying Keys

```typescript
// From headers (automatic detection)
const result = await keys.verify(request.headers);

// From string
const result = await keys.verify("sk_abc123");
const result = await keys.verify("Bearer sk_abc123");

// With options
const result = await keys.verify(headers, {
  headerNames: ["x-custom-key"],
  skipCache: true,
  skipTracking: true, // Skip updating lastUsedAt (useful when autoTrackUsage is enabled)
});

// Check result
if (result.valid) {
  console.log(result.record);
  // If rate limiting is enabled, result.rateLimit will include rate limit info
  if (result.rateLimit) {
    console.log(`${result.rateLimit.remaining} requests remaining`);
  }
} else {
  console.log(result.error); // 'Missing API key' | 'Invalid API key' | 'API key has expired' | 'API key is disabled' | 'API key has been revoked' | 'Rate limit exceeded'
  console.log(result.errorCode); // 'MISSING_KEY' | 'INVALID_KEY' | 'EXPIRED' | 'DISABLED' | 'REVOKED' | 'RATE_LIMIT_EXCEEDED'
}
```

### Permission Checking

```typescript
if (keys.hasScope(record, "write")) {
  /* ... */
}
if (keys.hasAnyScope(record, ["admin", "moderator"])) {
  /* ... */
}
if (keys.hasAllScopes(record, ["read", "write"])) {
  /* ... */
}
if (keys.isExpired(record)) {
  /* ... */
}
```

### Usage Tracking

```typescript
// Enable automatic tracking in config
const keys = createKeys({
  autoTrackUsage: true, // Automatically updates lastUsedAt on verify
});

// Manually update (always available)
await keys.updateLastUsed(record.id);

// Skip tracking for specific requests
const result = await keys.verify(headers, { skipTracking: true });
```

### Rate Limiting

Protect your API from abuse with built-in rate limiting. Uses the same cache infrastructure (memory or Redis) for high-performance request tracking. Windows are aligned to epoch time for consistent behavior in distributed systems.

**Note:** Cache must be enabled to use rate limiting.

#### Automatic Rate Limiting

Enable rate limiting globally on all verify calls by adding the `rateLimit` config option:

```typescript
const keys = createKeys({
  cache: true, // Required for rate limiting
  rateLimit: {
    maxRequests: 100,
    windowMs: 60_000, // 1 minute window
  },
});

// Rate limiting happens automatically on verify()
const result = await keys.verify(headers);

if (!result.valid) {
  if (result.errorCode === "RATE_LIMIT_EXCEEDED") {
    return {
      error: "Too many requests",
      status: 429,
      resetAt: result.rateLimit.resetAt,
      resetMs: result.rateLimit.resetMs,
    };
  }
  return { error: result.error, status: 401 };
}

// Rate limit info is included in successful responses
console.log({
  current: result.rateLimit.current, // Current request count
  limit: result.rateLimit.limit, // Max requests allowed
  remaining: result.rateLimit.remaining, // Remaining requests
  resetMs: result.rateLimit.resetMs, // Time until reset (ms)
  resetAt: result.rateLimit.resetAt, // ISO timestamp when window resets
});
```

**Complete middleware example with rate limit headers**:

```typescript
app.use("/api/*", async (c, next) => {
  const result = await keys.verify(c.req.raw.headers);

  if (!result.valid) {
    if (result.errorCode === "RATE_LIMIT_EXCEEDED") {
      c.header(
        "Retry-After",
        Math.ceil(result.rateLimit.resetMs / 1000).toString()
      );
      c.header("X-RateLimit-Limit", result.rateLimit.limit.toString());
      c.header("X-RateLimit-Remaining", "0");
      c.header("X-RateLimit-Reset", result.rateLimit.resetAt);
      return c.json({ error: "Too many requests" }, 429);
    }
    return c.json({ error: result.error }, 401);
  }

  // Set rate limit headers on successful requests
  c.header("X-RateLimit-Limit", result.rateLimit.limit.toString());
  c.header("X-RateLimit-Remaining", result.rateLimit.remaining.toString());
  c.header("X-RateLimit-Reset", result.rateLimit.resetAt);

  c.set("apiKey", result.record);
  await next();
});
```

#### Manual Rate Limiting (advanced)

For custom rate limiting scenarios (e.g., different limits per endpoint), create rate limiters manually:

```typescript
const keys = createKeys({
  cache: true, // Required for rate limiting
});

// Create custom rate limiters
const strictLimiter = keys.createRateLimiter({
  maxRequests: 10,
  windowMs: 60_000, // 10 requests per minute
});

const normalLimiter = keys.createRateLimiter({
  maxRequests: 100,
  windowMs: 60_000, // 100 requests per minute
});

// Use strict limiter for sensitive endpoints
app.post("/api/sensitive", async c => {
  const result = await keys.verify(c.req.raw.headers);
  if (!result.valid) {
    return c.json({ error: result.error }, 401);
  }

  const rateLimit = await strictLimiter.check(result.record);
  if (!rateLimit.allowed) {
    return c.json({ error: "Too many requests" }, 429);
  }
  // ...
});

// Use normal limiter for regular endpoints
app.get("/api/data", async c => {
  const result = await keys.verify(c.req.raw.headers);
  if (!result.valid) {
    return c.json({ error: result.error }, 401);
  }

  const rateLimit = await normalLimiter.check(result.record);
  if (!rateLimit.allowed) {
    return c.json({ error: "Too many requests" }, 429);
  }
  // ...
});
```

**Dry-run checks** (check without incrementing):

```typescript
const rateLimit = await rateLimiter.check(record, { increment: false });
```

**Custom identifiers** (e.g., per-owner limits instead of per-key):

```typescript
const rateLimit = await rateLimiter.check(record, {
  identifier: record.metadata.ownerId, // Rate limit by user, not by key
});
```

**Manual reset**:

```typescript
await rateLimiter.reset(record);
```

**Get current count without incrementing**:

```typescript
const count = await rateLimiter.getCurrentCount(record)
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
````

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
keys.hasKey(headers); // boolean
keys.extractKey(headers); // string | null
keys.generateKey(); // string
keys.hashKey(key); // string
```

## Storage Examples

### Memory (Default)

```typescript
const keys = createKeys({ prefix: "sk_" });
```

### Redis

```typescript
import Redis from "ioredis";

const redis = new Redis();

const keys = createKeys({
  prefix: "sk_",
  storage: "redis",
  cache: "redis",
  redis,
});
```

### Drizzle ORM

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { DrizzleStore } from "keypal/drizzle";
import { apikey } from "keypal/drizzle/schema";
import { createKeys } from "keypal";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, { schema: { apikey } });

const keys = createKeys({
  prefix: "sk_prod_",
  storage: new DrizzleStore({ db, table: apikey }),
  cache: true,
});
```

**Setup Database Schema:**

```typescript
// src/drizzle/schema.ts
import { index, jsonb, pgTable, text, unique } from "drizzle-orm/pg-core";

export const apikey = pgTable(
  "apikey",
  {
    id: text().primaryKey().notNull(),
    keyHash: text("key_hash").notNull(),
    metadata: jsonb("metadata").notNull(),
  },
  table => [
    index("apikey_key_hash_idx").on(table.keyHash),
    unique("apikey_key_hash_unique").on(table.keyHash),
  ]
);
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

### Custom Storage

```typescript
import { type Storage } from "keypal";

const customStorage: Storage = {
  save: async record => {
    /* ... */
  },
  findByHash: async keyHash => {
    /* ... */
  },
  findById: async id => {
    /* ... */
  },
  findByOwner: async ownerId => {
    /* ... */
  },
  findByTag: async (tag, ownerId) => {
    /* ... */
  },
  findByTags: async (tags, ownerId) => {
    /* ... */
  },
  updateMetadata: async (id, metadata) => {
    /* ... */
  },
  delete: async id => {
    /* ... */
  },
  deleteByOwner: async ownerId => {
    /* ... */
  },
};

const keys = createKeys({
  storage: customStorage,
});
```

## Framework Example (Hono)

```typescript
import { Hono } from "hono";
import { createKeys } from "keypal";
import Redis from "ioredis";

const redis = new Redis();

const keys = createKeys({
  prefix: "sk_",
  storage: "redis",
  cache: "redis",
  redis,
});

const app = new Hono();

// Authentication middleware
app.use("/api/*", async (c, next) => {
  const result = await keys.verify(c.req.raw.headers);

  if (!result.valid) {
    return c.json({ error: result.error }, 401);
  }

  c.set("apiKey", result.record);
  keys.updateLastUsed(result.record.id).catch(console.error);

  await next();
});

// Protected route with scope check
app.get("/api/data", async c => {
  const record = c.get("apiKey");

  if (!keys.hasScope(record, "read")) {
    return c.json({ error: "Insufficient permissions" }, 403);
  }

  return c.json({ data: "sensitive data" });
});
```

## Security Best Practices

1. **Use a salt in production**:

   ```typescript
   const keys = createKeys({
     salt: process.env.API_KEY_SALT,
     algorithm: "sha512",
   });
   ```

2. **Set expiration dates**: Don't create keys that never expire

3. **Use scopes**: Implement least-privilege access

4. **Enable caching**: Reduce database load in production

5. **Use HTTPS**: Always use HTTPS to prevent key interception

6. **Monitor usage**: Track `lastUsedAt` to identify unused keys

7. **Rotate keys**: Implement regular key rotation policies

   ```typescript
   // Rotate keys periodically
   const { key: newKey } = await keys.rotate(oldRecord.id);
   ```

8. **Use soft revocation**: Revoked keys are kept with `revokedAt` timestamp for audit trails (Redis TTL: 7 days, Drizzle: forever)

9. **Enable/Disable rather than revoke**: Temporarily disable keys instead of revoking them

## TypeScript Types

```typescript
interface ApiKeyRecord {
  id: string;
  keyHash: string;
  metadata: ApiKeyMetadata;
}

interface ApiKeyMetadata {
  ownerId: string;
  name?: string;
  description?: string;
  scopes?: string[];
  expiresAt: string | null;
  createdAt?: string;
  lastUsedAt?: string;
  enabled?: boolean;
  revokedAt?: string | null;
  rotatedTo?: string | null;
}

interface VerifyResult {
  valid: boolean;
  record?: ApiKeyRecord;
  error?: string;
  errorCode?: ApiKeyErrorCode;
  rateLimit?: {
    current: number;
    limit: number;
    remaining: number;
    resetMs: number;
    resetAt: string;
  };
}

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyPrefix?: string;
}

interface RateLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  resetMs: number;
  resetAt: string;
  remaining: number;
}

interface RateLimitCheckOptions {
  increment?: boolean;
  identifier?: string;
}
```

## License

MIT
