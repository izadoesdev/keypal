import { describe, it, expect } from 'vitest'
import { hasScope, hasAnyScope, hasAllScopes } from './scopes'

describe('scopes', () => {
    describe('hasScope', () => {
        it('should return true when scope exists', () => {
            expect(hasScope(['read', 'write'], 'read')).toBe(true)
        })

        it('should return false when scope does not exist', () => {
            expect(hasScope(['read', 'write'], 'delete')).toBe(false)
        })

        it('should return false for undefined scopes', () => {
            expect(hasScope(undefined, 'read')).toBe(false)
        })

        it('should return false for empty scopes', () => {
            expect(hasScope([], 'read')).toBe(false)
        })
    })

    describe('hasAnyScope', () => {
        it('should return true when any scope matches', () => {
            expect(hasAnyScope(['read', 'write'], ['delete', 'read'])).toBe(true)
        })

        it('should return false when no scopes match', () => {
            expect(hasAnyScope(['read', 'write'], ['delete', 'admin'])).toBe(false)
        })

        it('should return false for undefined scopes', () => {
            expect(hasAnyScope(undefined, ['read'])).toBe(false)
        })

        it('should return false for empty required scopes', () => {
            expect(hasAnyScope(['read', 'write'], [])).toBe(false)
        })
    })

    describe('hasAllScopes', () => {
        it('should return true when all scopes match', () => {
            expect(hasAllScopes(['read', 'write', 'delete'], ['read', 'write'])).toBe(true)
        })

        it('should return false when not all scopes match', () => {
            expect(hasAllScopes(['read', 'write'], ['read', 'delete'])).toBe(false)
        })

        it('should return false for undefined scopes', () => {
            expect(hasAllScopes(undefined, ['read'])).toBe(false)
        })

        it('should return true for empty required scopes', () => {
            expect(hasAllScopes(['read', 'write'], [])).toBe(true)
        })
    })
})

