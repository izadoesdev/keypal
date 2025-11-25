# Feature Roadmap

## Completed Features ✅

### Core Key Management
- **Custom prefix** — `sk_live_`, `pk_test_`, etc.
- **Custom length** — Configure key length (default: 32)
- **Custom alphabet** — URL-safe by default, customizable
- **Salt for hashing** — Additional security layer
- **SHA-256/SHA-512** — Choice of hashing algorithm

### Key Lifecycle
- **Enable/Disable** — Temporarily suspend keys without revoking
- **Revocation** — Permanently invalidate keys with audit trail
- **Key rotation** — Seamlessly replace keys with linked history
- **Auto lastUsedAt tracking** — Know when keys were last used

### Permissions & Scopes
- **Global scopes** — `["read", "write", "admin"]`
- **Resource-specific scopes** — Fine-grained per-resource permissions
- **ResourceBuilder** — Fluent API for building complex permissions

### Organization
- **Tags/Labels** — Categorize keys for filtering
- **Names & Descriptions** — Human-readable identification

### Observability
- **Audit logging** — Track all key lifecycle events
- **Log querying** — Filter by action, date, owner, key
- **Log statistics** — Aggregated insights

### Storage Adapters
- Memory, Redis, Drizzle, Prisma, Kysely, Convex

### Caching
- Memory cache, Redis cache, Custom cache adapters

---

## DX Improvements for Existing Features

### 1. Expiration Helper (expiresIn)

Support human-readable duration strings instead of manual ISO timestamps.

```typescript
// Before (current)
const { key } = await keys.create({
  ownerId: "user_123",
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
})

// After (proposed)
const { key } = await keys.create({
  ownerId: "user_123",
  expiresIn: "30d" // or "1h", "7d", "90d", "1y"
})
```

### 2. Scoped Create Helper

Simplify common scope patterns with presets.

```typescript
// Before
const { key } = await keys.create({
  ownerId: "user_123",
  scopes: ["read"]
})

// After (proposed)
const { key } = await keys.createReadOnly({ ownerId: "user_123" })
const { key } = await keys.createFullAccess({ ownerId: "user_123" })
```

### 3. Chainable Verification

Fluent API for common verification patterns.

```typescript
// Before
const result = await keys.verify(headers)
if (!result.valid) throw new Error(result.error)
if (!keys.hasScope(result.record!, "write")) throw new Error("Forbidden")

// After (proposed)
const record = await keys
  .verify(headers)
  .requireScope("write")
  .orThrow()
```

### 4. Update Metadata

Direct metadata updates without full rotation.

```typescript
// Proposed
await keys.update(keyId, {
  name: "Renamed Key",
  tags: ["production", "critical"],
  scopes: ["read", "write", "deploy"]
})
```

### 5. Bulk Operations

Efficient batch operations for enterprise use cases.

```typescript
// Proposed
const results = await keys.createMany([
  { ownerId: "user_1", scopes: ["read"] },
  { ownerId: "user_2", scopes: ["write"] }
])

await keys.revokeMany(["key_1", "key_2", "key_3"])

const records = await keys.verifyMany([key1, key2, key3])
```

---

## High-Impact Feature Recommendations

### 🔴 Critical Priority

#### 1. Rate Limiting

Protect APIs from abuse with built-in rate limiting that ties into key verification.

```typescript
const keys = createKeys({
  rateLimit: {
    enabled: true,
    default: { requests: 1000, window: "1h" }
  }
})

// Per-key limits
const { key } = await keys.create({
  ownerId: "user_123",
  rateLimit: { requests: 100, window: "1m" }
})

// Verification includes rate limit check
const result = await keys.verify(apiKey)
if (result.rateLimited) {
  return { error: "Rate limit exceeded", retryAfter: result.retryAfter }
}
```

#### 2. Middleware Integrations

First-class support for popular frameworks.

```typescript
// Express
import { createKeysMiddleware } from "keypal/express"
app.use("/api", createKeysMiddleware(keys, {
  scopes: ["api:access"],
  onError: (err, req, res) => res.status(401).json({ error: err.message })
}))

// Hono
import { keysMiddleware } from "keypal/hono"
app.use("/api/*", keysMiddleware(keys))

// Next.js
import { withApiKey } from "keypal/next"
export const GET = withApiKey(keys, async (req, { record }) => {
  return Response.json({ user: record.metadata.ownerId })
})
```

#### 3. Webhooks

Real-time notifications for key lifecycle events.

```typescript
const keys = createKeys({
  webhooks: {
    url: "https://api.example.com/webhooks/keys",
    secret: process.env.WEBHOOK_SECRET,
    events: ["created", "revoked", "rotated", "expired"]
  }
})

// Webhook payload
{
  event: "key.revoked",
  timestamp: "2025-01-15T10:30:00Z",
  data: {
    keyId: "key_abc123",
    ownerId: "user_123",
    revokedBy: "admin_456"
  }
}
```

---

### 🟠 High Priority

#### 4. Usage Analytics & Quotas

Track API usage per key with configurable quotas.

```typescript
const { key } = await keys.create({
  ownerId: "user_123",
  quota: {
    limit: 10000,
    period: "month",
    onExceeded: "block" // or "warn", "throttle"
  }
})

// Get usage stats
const usage = await keys.getUsage(keyId)
// { used: 4521, limit: 10000, remaining: 5479, resetsAt: "2025-02-01" }

// Track custom usage
await keys.trackUsage(keyId, {
  endpoint: "/api/generate",
  tokens: 1500, // for AI APIs
  cost: 0.002
})
```

#### 5. IP Restrictions

Allowlist or blocklist IP addresses per key.

```typescript
const { key } = await keys.create({
  ownerId: "user_123",
  allowedIPs: ["192.168.1.0/24", "10.0.0.1"],
  // or
  blockedIPs: ["1.2.3.4"]
})

// Verification checks IP
const result = await keys.verify(apiKey, { ip: req.ip })
if (result.errorCode === "IP_NOT_ALLOWED") {
  // Handle blocked IP
}
```

#### 6. Environment Keys (Live/Test)

Built-in support for environment separation.

```typescript
const keys = createKeys({
  environments: {
    live: { prefix: "sk_live_" },
    test: { prefix: "sk_test_", rateLimit: null }
  }
})

// Create environment-specific keys
const liveKey = await keys.create({ ownerId: "user_123", env: "live" })
const testKey = await keys.create({ ownerId: "user_123", env: "test" })

// Auto-detect environment from key prefix
const result = await keys.verify(key)
console.log(result.record?.env) // "live" or "test"
```

#### 7. Key Policies

Declarative access control policies.

```typescript
const keys = createKeys({
  policies: {
    "api:admin": {
      scopes: ["*"],
      resources: ["*"],
      rateLimit: null
    },
    "api:readonly": {
      scopes: ["read"],
      maxTtl: "90d"
    },
    "api:integration": {
      scopes: ["read", "write"],
      requireIP: true,
      maxResources: 10
    }
  }
})

const { key } = await keys.create({
  ownerId: "user_123",
  policy: "api:integration",
  allowedIPs: ["10.0.0.1"]
})
```

---

### 🟡 Medium Priority

#### 8. Multi-tenancy / Organizations

Support for organization-level key management.

```typescript
const { key } = await keys.create({
  ownerId: "user_123",
  orgId: "org_456",
  scopes: ["org:read", "org:write"]
})

// List all keys for an organization
const orgKeys = await keys.listByOrg("org_456")

// Revoke all keys when user leaves org
await keys.revokeByOwnerAndOrg("user_123", "org_456")
```

#### 9. Request Signing (HMAC)

Cryptographic request verification for sensitive operations.

```typescript
// Client side
const signature = keys.sign({
  method: "POST",
  path: "/api/transfer",
  body: { amount: 100 },
  timestamp: Date.now()
}, secretKey)

// Server side
const isValid = await keys.verifySignature(request, signature, {
  maxAge: "5m" // Prevent replay attacks
})
```

#### 10. Geographic Restrictions

Limit key usage by geographic region.

```typescript
const { key } = await keys.create({
  ownerId: "user_123",
  allowedRegions: ["US", "EU", "GB"],
  // or
  blockedRegions: ["CN", "RU"]
})

const result = await keys.verify(apiKey, {
  geo: { country: "US", region: "CA" }
})
```

#### 11. Key Inheritance

Child keys that inherit permissions from parent keys.

```typescript
// Create a parent key with full access
const parent = await keys.create({
  ownerId: "user_123",
  scopes: ["read", "write", "admin"]
})

// Create child keys with restricted subsets
const child = await keys.create({
  ownerId: "user_123",
  parentId: parent.record.id,
  scopes: ["read"] // Must be subset of parent
})

// Revoking parent automatically revokes children
await keys.revoke(parent.record.id, { cascade: true })
```

---

### 🟢 Nice to Have

#### 12. Key Templates

Reusable templates for common key configurations.

```typescript
keys.defineTemplate("external-partner", {
  scopes: ["read"],
  expiresIn: "90d",
  rateLimit: { requests: 100, window: "1h" },
  policy: "api:readonly"
})

const { key } = await keys.createFromTemplate("external-partner", {
  ownerId: "partner_123",
  name: "Acme Corp Integration"
})
```

#### 13. Key Import/Export

Migration support for moving between systems.

```typescript
// Export keys (hashes only, never plaintext)
const exported = await keys.export({
  ownerId: "user_123",
  format: "json"
})

// Import from another system
await keys.import(exported, {
  onConflict: "skip" // or "overwrite", "error"
})
```

#### 14. Scheduled Actions

Time-based automated key management.

```typescript
const { key } = await keys.create({
  ownerId: "user_123",
  schedule: {
    disableAt: "2025-06-01T00:00:00Z",
    revokeAt: "2025-07-01T00:00:00Z",
    notifyBefore: "7d" // Webhook notification
  }
})
```

#### 15. Key Descriptions via AI

Auto-generate descriptions based on key usage patterns.

```typescript
const insights = await keys.analyze(keyId)
// {
//   suggestedName: "Production API - High Traffic",
//   usagePattern: "Mainly read operations, peak at 2pm UTC",
//   securityScore: 85,
//   recommendations: ["Consider IP restriction", "Add rate limit"]
// }
```

---

## Implementation Priorities

| Feature | Impact | Effort | Priority |
|---------|--------|--------|----------|
| Rate Limiting | 🔥🔥🔥 | Medium | P0 |
| Middleware (Express/Hono/Next) | 🔥🔥🔥 | Low | P0 |
| expiresIn helper | 🔥🔥 | Low | P0 |
| Usage Analytics & Quotas | 🔥🔥🔥 | High | P1 |
| IP Restrictions | 🔥🔥🔥 | Medium | P1 |
| Webhooks | 🔥🔥 | Medium | P1 |
| Environment Keys | 🔥🔥 | Low | P1 |
| Key Policies | 🔥🔥 | Medium | P2 |
| Update Metadata | 🔥🔥 | Low | P2 |
| Bulk Operations | 🔥🔥 | Medium | P2 |
| Multi-tenancy | 🔥🔥 | High | P2 |
| Request Signing | 🔥 | Medium | P3 |
| Key Templates | 🔥 | Low | P3 |
| Chainable Verification | 🔥 | Medium | P3 |

---

## Design Principles

1. **Zero-config defaults** — Everything works out of the box
2. **Progressive complexity** — Simple things simple, complex things possible
3. **Type-safe** — Full TypeScript inference
4. **Framework agnostic** — Core has no dependencies on web frameworks
5. **Storage agnostic** — Bring your own database
6. **Composable** — Features work independently or together
