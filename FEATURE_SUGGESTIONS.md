# Suggested Additional Features

## Currently Implemented
- ✅ Custom alphabet for key generation
- ✅ Salt for hashing
- ✅ Update last used timestamp

## Recommended Additions

### 1. Rate Limiting Helper
```typescript
interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

// Usage:
const rateLimiter = keys.createRateLimiter({
  maxRequests: 100,
  windowMs: 60000, // 1 minute
})

await rateLimiter.check(apiKeyRecord)
```

### 2. Key Rotation
```typescript
// Rotate a key (create new, mark old as rotating)
const { newKey, oldRecord } = await keys.rotate(oldKeyId, {
  gracePeriodMs: 86400000, // 24 hours
})
```

### 3. Usage Analytics
```typescript
// Track key usage
await keys.trackUsage(keyId, {
  endpoint: '/api/users',
  method: 'GET',
  ipAddress: '1.2.3.4',
})

// Get usage stats
const stats = await keys.getUsageStats(keyId)
```

### 4. Key Tags/Labels
```typescript
await keys.create({
  ownerId: 'user_123',
  tags: ['production', 'billing-api'],
})

// Find by tag
const keys = await keys.findByTag('production')
```

### 5. Webhook Events
```typescript
keys.on('key.created', async (event) => {
  await sendWebhook(event.ownerId, 'key_created', event.data)
})

keys.on('key.used', async (event) => {
  // Log to analytics
})

keys.on('key.expired', async (event) => {
  // Notify owner
})
```

### 6. IP Whitelisting
```typescript
await keys.create({
  ownerId: 'user_123',
  allowedIPs: ['192.168.1.1', '10.0.0.0/24'],
})

await keys.verify(key, { ipAddress: req.ip })
```

### 7. Request Signing
```typescript
// HMAC-based request signing
const signature = keys.sign(request, apiKey)

// Verify signature
const isValid = await keys.verifySignature(request, signature, keyId)
```

### 8. Bulk Operations
```typescript
// Bulk create
const results = await keys.createBulk([
  { ownerId: 'user_1', scopes: ['read'] },
  { ownerId: 'user_2', scopes: ['write'] },
])

// Bulk revoke
await keys.revokeBulk(['key_1', 'key_2', 'key_3'])
```

### 9. Key Templates
```typescript
// Define reusable templates
keys.defineTemplate('readonly', {
  scopes: ['read'],
  expiresIn: '30d',
})

const { key } = await keys.createFromTemplate('readonly', {
  ownerId: 'user_123',
})
```

### 10. Audit Logging
```typescript
interface AuditLog {
  action: 'created' | 'verified' | 'revoked' | 'updated'
  keyId: string
  ownerId: string
  timestamp: string
  metadata: Record<string, any>
}

const logs = await keys.getAuditLogs({
  keyId: 'key_123',
  startDate: '2025-01-01',
  endDate: '2025-12-31',
})
```

## Priority Recommendations

**High Priority:**
1. Rate limiting (security)
2. Update last used timestamp (already added)
3. Audit logging (compliance)

**Medium Priority:**
4. Key rotation (security best practice)
5. IP whitelisting (additional security layer)
6. Usage analytics (insights)

**Low Priority:**
7. Webhook events (automation)
8. Request signing (advanced security)
9. Key templates (convenience)
10. Bulk operations (efficiency)

## Implementation Notes

- Keep the core simple and focused
- Additional features could be plugins/extensions
- Consider a middleware/hook system for extensibility
- Maintain backward compatibility

