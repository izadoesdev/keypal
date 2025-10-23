import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { serve } from '@hono/node-server'
import { Hono, type Context } from 'hono'
import { createKeys } from '../src/index'
import type { ApiKeyRecord } from '../src/types/api-key-types'

type Variables = {
    keyRecord: ApiKeyRecord
}

// Create a test version of the API using simplified API
function createTestAPI() {
    const keys = createKeys({
        prefix: 'sk_test_',
        // MemoryStore is default, no need to specify
    })

    const app = new Hono<{ Variables: Variables }>()

    // Simplified middleware using verify()
    const requireAuth = async (c: Context<{ Variables: Variables }>, next: () => Promise<void>) => {
        const authHeader = c.req.header('Authorization')

        if (!authHeader) {
            return c.json({ error: 'Missing Authorization header' }, 401)
        }

        const result = await keys.verify(authHeader)

        if (!result.valid || !result.record) {
            return c.json({ error: result.error || 'Invalid API key' }, 401)
        }

        c.set('keyRecord', result.record)
        await next()
    }

    app.get('/health', (c) => c.json({ status: 'ok' }))

    app.post('/keys', async (c) => {
        try {
            const body = await c.req.json<{
                ownerId?: string
                name?: string
                description?: string
                scopes?: string[]
                expiresAt?: string
            }>()

            const { ownerId, name, description, scopes, expiresAt } = body

            if (!ownerId || typeof ownerId !== 'string' || ownerId.trim() === '') {
                return c.json({ error: 'ownerId is required and must be a non-empty string' }, 400)
            }

            if (name !== undefined && typeof name !== 'string') {
                return c.json({ error: 'name must be a string' }, 400)
            }

            if (description !== undefined && typeof description !== 'string') {
                return c.json({ error: 'description must be a string' }, 400)
            }

            if (scopes !== undefined && (!Array.isArray(scopes) || !scopes.every(s => typeof s === 'string'))) {
                return c.json({ error: 'scopes must be an array of strings' }, 400)
            }

            let expiresAtISO: string | undefined
            if (expiresAt) {
                const expiryDate = new Date(expiresAt)
                if (isNaN(expiryDate.getTime())) {
                    return c.json({ error: 'expiresAt must be a valid ISO date string' }, 400)
                }
                if (expiryDate <= new Date()) {
                    return c.json({ error: 'expiresAt must be a future date' }, 400)
                }
                expiresAtISO = expiryDate.toISOString()
            }

            const { key, record } = await keys.create({
                ownerId: ownerId.trim(),
                name: name?.trim(),
                description: description?.trim(),
                scopes,
                expiresAt: expiresAtISO,
            })

            return c.json({
                id: record.id,
                key,
                expiresAt: record.metadata.expiresAt,
                createdAt: record.metadata.createdAt,
            }, 201)
        } catch (error) {
            return c.json({ error: 'Failed to create API key' }, 500)
        }
    })

    app.get('/keys/:ownerId', requireAuth, async (c) => {
        const ownerId = c.req.param('ownerId')

        if (!ownerId || ownerId.trim() === '') {
            return c.json({ error: 'ownerId parameter is required' }, 400)
        }

        const currentKey = c.get('keyRecord')

        if (currentKey.metadata.ownerId !== ownerId && !keys.hasScope(currentKey, 'admin')) {
            return c.json({ error: 'Unauthorized' }, 403)
        }

        const keyList = await keys.list(ownerId)

        return c.json(keyList.map(k => ({
            id: k.id,
            name: k.metadata.name,
            description: k.metadata.description,
            scopes: k.metadata.scopes,
            expiresAt: k.metadata.expiresAt,
            createdAt: k.metadata.createdAt,
            isExpired: keys.isExpired(k),
        })))
    })

    app.post('/keys/validate', async (c) => {
        try {
            const body = await c.req.json<{ key?: string }>()
            const { key } = body

            if (!key || typeof key !== 'string' || key.trim() === '') {
                return c.json({ error: 'Key is required and must be a non-empty string' }, 400)
            }

            const result = await keys.verify(key)

            if (!result.valid || !result.record) {
                return c.json({
                    valid: false,
                    reason: result.error || 'Invalid key',
                })
            }

            return c.json({
                valid: true,
                ownerId: result.record.metadata.ownerId,
                scopes: result.record.metadata.scopes,
                expiresAt: result.record.metadata.expiresAt,
            })
        } catch (error) {
            return c.json({ error: 'Failed to validate API key' }, 500)
        }
    })

    app.get('/protected', requireAuth, (c) => {
        const record = c.get('keyRecord')

        return c.json({
            message: 'This is a protected route',
            authenticatedAs: record.metadata.ownerId,
            scopes: record.metadata.scopes,
        })
    })

    app.get('/admin', requireAuth, (c) => {
        const record = c.get('keyRecord')

        if (!keys.hasScope(record, 'admin')) {
            return c.json({ error: 'Admin scope required' }, 403)
        }

        return c.json({
            message: 'Admin access granted',
            adminInfo: 'Sensitive admin data here',
        })
    })

    app.onError((err, c) => {
        console.error('Server error:', err)
        return c.json({ error: 'Internal Server Error' }, 500)
    })

    app.notFound((c) => {
        return c.json({ error: 'Not Found' }, 404)
    })

    return { app, keys }
}

interface KeyResponse {
    id: string
    key: string
    expiresAt?: string | null
    createdAt?: string
}

interface ValidationResponse {
    valid: boolean
    ownerId?: string
    scopes?: string[]
    expiresAt?: string | null
    reason?: string
}

interface ErrorResponse {
    error: string
}

describe('HTTP API Integration', () => {
    let server: ReturnType<typeof serve>
    let keys: ReturnType<typeof createKeys>
    let baseURL: string
    let generatedKey: string
    let keyId: string

    beforeAll(async () => {
        const { app, keys: manager } = createTestAPI()
        keys = manager

        const port = 3001
        baseURL = `http://localhost:${port}`

        server = serve({
            fetch: app.fetch,
            port,
        })

        // Wait for server to start
        await new Promise(resolve => setTimeout(resolve, 100))

        // Generate a key for testing
        const res = await keys.create({
            ownerId: 'user_test',
            name: 'Test Key',
            scopes: ['read', 'write'],
        })

        generatedKey = res.key
        keyId = res.record.id
    })

    afterAll(async () => {
        if (server) {
            server.close()
        }
    })

    describe('Health Check', () => {
        it('should return health status', async () => {
            const response = await fetch(`${baseURL}/health`)
            const data = await response.json() as { status: string }

            expect(response.status).toBe(200)
            expect(data.status).toBe('ok')
        })
    })

    describe('Key Creation Endpoint', () => {
        it('should create an API key', async () => {
            const response = await fetch(`${baseURL}/keys`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ownerId: 'user_new',
                    name: 'New Test Key',
                    scopes: ['read'],
                }),
            })

            const data = await response.json() as KeyResponse

            expect(response.status).toBe(201)
            expect(data.key).toMatch(/^sk_test_/)
            expect(data.id).toBeDefined()
            expect(data.createdAt).toBeDefined()
        })

        it('should require ownerId', async () => {
            const response = await fetch(`${baseURL}/keys`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'Test Key',
                }),
            })

            const data = await response.json() as ErrorResponse
            expect(response.status).toBe(400)
            expect(data.error).toContain('ownerId')
        })

        it('should reject empty ownerId', async () => {
            const response = await fetch(`${baseURL}/keys`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ownerId: '   ',
                }),
            })

            const data = await response.json() as ErrorResponse
            expect(response.status).toBe(400)
            expect(data.error).toContain('ownerId')
        })

        it('should reject non-string ownerId', async () => {
            const response = await fetch(`${baseURL}/keys`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ownerId: 12345,
                }),
            })

            const data = await response.json() as ErrorResponse
            expect(response.status).toBe(400)
            expect(data.error).toContain('ownerId')
        })

        it('should reject past expiry dates', async () => {
            const pastDate = new Date()
            pastDate.setFullYear(pastDate.getFullYear() - 1)

            const response = await fetch(`${baseURL}/keys`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ownerId: 'user_test',
                    expiresAt: pastDate.toISOString(),
                }),
            })

            const data = await response.json() as ErrorResponse
            expect(response.status).toBe(400)
            expect(data.error).toContain('future')
        })

        it('should reject invalid expiry date format', async () => {
            const response = await fetch(`${baseURL}/keys`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ownerId: 'user_test',
                    expiresAt: 'not-a-date',
                }),
            })

            const data = await response.json() as ErrorResponse
            expect(response.status).toBe(400)
            expect(data.error).toContain('valid ISO date')
        })

        it('should accept valid future expiry date', async () => {
            const futureDate = new Date()
            futureDate.setFullYear(futureDate.getFullYear() + 1)

            const response = await fetch(`${baseURL}/keys`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ownerId: 'user_test',
                    expiresAt: futureDate.toISOString(),
                }),
            })

            const data = await response.json() as KeyResponse
            expect(response.status).toBe(201)
            expect(data.expiresAt).toBeDefined()
        })
    })

    describe('Key Validation Endpoint', () => {
        it('should validate a correct key', async () => {
            const response = await fetch(`${baseURL}/keys/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: generatedKey }),
            })

            const data = await response.json() as ValidationResponse

            expect(response.status).toBe(200)
            expect(data.valid).toBe(true)
            expect(data.ownerId).toBe('user_test')
            expect(data.scopes).toEqual(['read', 'write'])
        })

        it('should reject an invalid key', async () => {
            const response = await fetch(`${baseURL}/keys/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'sk_test_invalid123456' }),
            })

            const data = await response.json() as ValidationResponse

            expect(response.status).toBe(200)
            expect(data.valid).toBe(false)
            expect(data.reason).toBeDefined()
        })

        it('should reject missing key', async () => {
            const response = await fetch(`${baseURL}/keys/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            })

            const data = await response.json() as ErrorResponse
            expect(response.status).toBe(400)
            expect(data.error).toContain('Key')
        })

        it('should reject empty key', async () => {
            const response = await fetch(`${baseURL}/keys/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: '' }),
            })

            const data = await response.json() as ErrorResponse
            expect(response.status).toBe(400)
            expect(data.error).toBeDefined()
        })

        it('should detect expired keys', async () => {
            const pastDate = new Date()
            pastDate.setFullYear(pastDate.getFullYear() - 1)

            const { key } = await keys.create({
                ownerId: 'user_expired',
                expiresAt: pastDate.toISOString(),
            })

            const response = await fetch(`${baseURL}/keys/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key }),
            })

            const data = await response.json() as ValidationResponse
            expect(response.status).toBe(200)
            expect(data.valid).toBe(false)
            expect(data.reason).toContain('expired')
        })
    })

    describe('Protected Routes', () => {
        it('should access protected route with valid key', async () => {
            const response = await fetch(`${baseURL}/protected`, {
                headers: {
                    'Authorization': `Bearer ${generatedKey}`,
                },
            })

            const data = await response.json() as {
                message: string
                authenticatedAs: string
                scopes?: string[]
            }

            expect(response.status).toBe(200)
            expect(data.message).toBe('This is a protected route')
            expect(data.authenticatedAs).toBe('user_test')
            expect(data.scopes).toEqual(['read', 'write'])
        })

        it('should work without Bearer prefix', async () => {
            const response = await fetch(`${baseURL}/protected`, {
                headers: {
                    'Authorization': generatedKey,
                },
            })

            expect(response.status).toBe(200)
        })

        it('should reject request without Authorization header', async () => {
            const response = await fetch(`${baseURL}/protected`)

            const data = await response.json() as ErrorResponse
            expect(response.status).toBe(401)
            expect(data.error).toBe('Missing Authorization header')
        })

        it('should reject request with invalid key', async () => {
            const response = await fetch(`${baseURL}/protected`, {
                headers: {
                    'Authorization': 'Bearer sk_test_invalid',
                },
            })

            const data = await response.json() as ErrorResponse
            expect(response.status).toBe(401)
            expect(data.error).toBeDefined()
        })

        it('should reject expired keys', async () => {
            const pastDate = new Date()
            pastDate.setFullYear(pastDate.getFullYear() - 1)

            const { key } = await keys.create({
                ownerId: 'user_expired_2',
                expiresAt: pastDate.toISOString(),
            })

            const response = await fetch(`${baseURL}/protected`, {
                headers: {
                    'Authorization': `Bearer ${key}`,
                },
            })

            const data = await response.json() as ErrorResponse
            expect(response.status).toBe(401)
            expect(data.error).toContain('expired')
        })

        it('should reject keys with wrong prefix', async () => {
            const response = await fetch(`${baseURL}/protected`, {
                headers: {
                    'Authorization': 'Bearer sk_wrong_prefix123',
                },
            })

            const data = await response.json() as ErrorResponse
            expect(response.status).toBe(401)
            expect(data.error).toContain('Invalid API key')
        })
    })

    describe('Admin Route', () => {
        it('should reject non-admin key', async () => {
            const response = await fetch(`${baseURL}/admin`, {
                headers: {
                    'Authorization': `Bearer ${generatedKey}`,
                },
            })

            const data = await response.json() as ErrorResponse
            expect(response.status).toBe(403)
            expect(data.error).toBe('Admin scope required')
        })

        it('should allow admin key', async () => {
            const { key } = await keys.create({
                ownerId: 'admin_user',
                scopes: ['admin'],
            })

            const response = await fetch(`${baseURL}/admin`, {
                headers: {
                    'Authorization': `Bearer ${key}`,
                },
            })

            const data = await response.json() as {
                message: string
                adminInfo: string
            }

            expect(response.status).toBe(200)
            expect(data.message).toBe('Admin access granted')
            expect(data.adminInfo).toBeDefined()
        })
    })

    describe('List Keys Endpoint', () => {
        it('should list keys for owner', async () => {
            const { key } = await keys.create({
                ownerId: 'user_list',
                name: 'Key 1',
            })

            await keys.create({
                ownerId: 'user_list',
                name: 'Key 2',
            })

            const response = await fetch(`${baseURL}/keys/user_list`, {
                headers: {
                    'Authorization': `Bearer ${key}`,
                },
            })

            const data = await response.json() as Array<{
                id: string
                name?: string
                isExpired: boolean
            }>

            expect(response.status).toBe(200)
            expect(Array.isArray(data)).toBe(true)
            expect(data.length).toBe(2)
            expect(data[0]?.isExpired).toBe(false)
        })

        it('should prevent unauthorized access to other users keys', async () => {
            const response = await fetch(`${baseURL}/keys/other_user`, {
                headers: {
                    'Authorization': `Bearer ${generatedKey}`,
                },
            })

            const data = await response.json() as ErrorResponse
            expect(response.status).toBe(403)
            expect(data.error).toBe('Unauthorized')
        })

        it('should allow admin to view any users keys', async () => {
            const { key: adminKey } = await keys.create({
                ownerId: 'admin_list',
                scopes: ['admin'],
            })

            const response = await fetch(`${baseURL}/keys/user_test`, {
                headers: {
                    'Authorization': `Bearer ${adminKey}`,
                },
            })

            expect(response.status).toBe(200)
        })
    })

    describe('Edge Cases', () => {
        it('should handle malformed JSON', async () => {
            const response = await fetch(`${baseURL}/keys`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: 'not valid json',
            })

            expect(response.status).toBe(500)
        })

        it('should handle wrong HTTP method', async () => {
            const response = await fetch(`${baseURL}/protected`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${generatedKey}`,
                },
            })

            expect(response.status).toBe(404)
        })

        it('should handle non-existent routes', async () => {
            const response = await fetch(`${baseURL}/nonexistent`)

            const data = await response.json() as ErrorResponse
            expect(response.status).toBe(404)
            expect(data.error).toBe('Not Found')
        })

        it('should handle empty Authorization header', async () => {
            const response = await fetch(`${baseURL}/protected`, {
                headers: {
                    'Authorization': '',
                },
            })

            const data = await response.json() as ErrorResponse
            expect(response.status).toBe(401)
            expect(data.error).toBeDefined()
        })

        it('should handle Bearer with empty key', async () => {
            const response = await fetch(`${baseURL}/protected`, {
                headers: {
                    'Authorization': 'Bearer ',
                },
            })

            const data = await response.json() as ErrorResponse
            expect(response.status).toBe(401)
            expect(data.error).toBeDefined()
        })
    })
})
