# Suggested Additional Features

## Recommended Additions

### 1. Key Rotation
```typescript
// Rotate a key (create new, mark old as rotating)
const { newKey, oldRecord } = await keys.rotate(oldKeyId, {
  gracePeriodMs: 86400000, // 24 hours
})
```

### 2. Usage Analytics
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

### 3. Webhook Events
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

### 4. IP Whitelisting
```typescript
await keys.create({
  ownerId: 'user_123',
  allowedIPs: ['192.168.1.1', '10.0.0.0/24'],
})

await keys.verify(key, { ipAddress: req.ip })
```

### 5. Request Signing
```typescript
// HMAC-based request signing
const signature = keys.sign(request, apiKey)

// Verify signature
const isValid = await keys.verifySignature(request, signature, keyId)
```

### 6. Bulk Operations
```typescript
// Bulk create
const results = await keys.createBulk([
  { ownerId: 'user_1', scopes: ['read'] },
  { ownerId: 'user_2', scopes: ['write'] },
])

// Bulk revoke
await keys.revokeBulk(['key_1', 'key_2', 'key_3'])
```

### 7. Key Templates
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

## Priority Recommendations

**High Priority:**
1. Rate limiting (security)

**Medium Priority:**
2. IP whitelisting (additional security layer)
3. Usage analytics (insights)

**Low Priority:**
4. Request signing (advanced security)
5. Key templates (convenience)
6. Bulk operations (efficiency)

## Completed Features ✅
- Custom alphabet for key generation
- Salt for hashing
- Update last used timestamp
- Key tags/labels
- Audit logging (opt-in)
- Key rotation
- Rate limiting (opt-in)

## Implementation Notes

- Keep the core simple and focused
- Additional features could be plugins/extensions
- Consider a middleware/hook system for extensibility
- Maintain backward compatibility

