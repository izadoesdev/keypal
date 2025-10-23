import { describe, it, expect } from 'vitest'
import { extractKeyFromHeaders, hasApiKey } from './extract-key'

describe('extractKeyFromHeaders', () => {
    describe('with Headers object', () => {
        it('should extract from Authorization header with Bearer', () => {
            const headers = new Headers({
                'authorization': 'Bearer sk_test_123',
            })

            const key = extractKeyFromHeaders(headers)
            expect(key).toBe('sk_test_123')
        })

        it('should extract from x-api-key header', () => {
            const headers = new Headers({
                'x-api-key': 'sk_test_456',
            })

            const key = extractKeyFromHeaders(headers)
            expect(key).toBe('sk_test_456')
        })

        it('should prefer Authorization over x-api-key', () => {
            const headers = new Headers({
                'authorization': 'Bearer sk_auth_123',
                'x-api-key': 'sk_api_456',
            })

            const key = extractKeyFromHeaders(headers)
            expect(key).toBe('sk_auth_123')
        })

        it('should handle Authorization without Bearer', () => {
            const headers = new Headers({
                'authorization': 'sk_test_789',
            })

            const key = extractKeyFromHeaders(headers, { extractBearer: false })
            expect(key).toBe('sk_test_789')
        })

        it('should return null when no key present', () => {
            const headers = new Headers({
                'content-type': 'application/json',
            })

            const key = extractKeyFromHeaders(headers)
            expect(key).toBeNull()
        })

        it('should handle empty Bearer token', () => {
            const headers = new Headers({
                'authorization': 'Bearer ',
            })

            const key = extractKeyFromHeaders(headers)
            expect(key).toBeNull()
        })

        it('should trim whitespace', () => {
            const headers = new Headers({
                'x-api-key': '  sk_test_123  ',
            })

            const key = extractKeyFromHeaders(headers)
            expect(key).toBe('sk_test_123')
        })
    })

    describe('with plain object', () => {
        it('should extract from authorization header', () => {
            const headers = {
                'authorization': 'Bearer sk_test_123',
            }

            const key = extractKeyFromHeaders(headers)
            expect(key).toBe('sk_test_123')
        })

        it('should handle case-insensitive headers', () => {
            const headers = {
                'Authorization': 'Bearer sk_test_123',
            }

            const key = extractKeyFromHeaders(headers)
            expect(key).toBe('sk_test_123')
        })

        it('should extract from x-api-key', () => {
            const headers = {
                'x-api-key': 'sk_test_456',
            }

            const key = extractKeyFromHeaders(headers)
            expect(key).toBe('sk_test_456')
        })
    })

    describe('with custom headers', () => {
        it('should support custom header names', () => {
            const headers = new Headers({
                'x-custom-key': 'custom_key_123',
            })

            const key = extractKeyFromHeaders(headers, {
                headerNames: ['x-custom-key'],
            })

            expect(key).toBe('custom_key_123')
        })

        it('should check multiple custom headers in order', () => {
            const headers = new Headers({
                'x-api-token': 'token_123',
                'x-api-key': 'key_456',
            })

            const key = extractKeyFromHeaders(headers, {
                headerNames: ['x-api-token', 'x-api-key'],
            })

            expect(key).toBe('token_123')
        })
    })

    describe('hasApiKey', () => {
        it('should return true when key present', () => {
            const headers = new Headers({
                'authorization': 'Bearer sk_test_123',
            })

            expect(hasApiKey(headers)).toBe(true)
        })

        it('should return false when key absent', () => {
            const headers = new Headers({
                'content-type': 'application/json',
            })

            expect(hasApiKey(headers)).toBe(false)
        })

        it('should work with plain objects', () => {
            const headers = {
                'x-api-key': 'sk_test_123',
            }

            expect(hasApiKey(headers)).toBe(true)
        })
    })
})

