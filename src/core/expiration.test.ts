import { describe, it, expect } from 'vitest'
import { isExpired, getExpirationTime } from './expiration'

describe('expiration', () => {
    describe('isExpired', () => {
        it('should return false for null expiration', () => {
            expect(isExpired(null)).toBe(false)
        })

        it('should return false for undefined expiration', () => {
            expect(isExpired(undefined)).toBe(false)
        })

        it('should return false for future date', () => {
            const future = new Date()
            future.setFullYear(future.getFullYear() + 1)
            expect(isExpired(future.toISOString())).toBe(false)
        })

        it('should return true for past date', () => {
            const past = new Date()
            past.setFullYear(past.getFullYear() - 1)
            expect(isExpired(past.toISOString())).toBe(true)
        })

        it('should return true for current time', () => {
            const now = new Date()
            now.setSeconds(now.getSeconds() - 1)
            expect(isExpired(now.toISOString())).toBe(true)
        })

        it('should handle invalid date strings', () => {
            expect(isExpired('invalid-date')).toBe(false)
        })
    })

    describe('getExpirationTime', () => {
        it('should return null for null expiration', () => {
            expect(getExpirationTime(null)).toBeNull()
        })

        it('should return null for undefined expiration', () => {
            expect(getExpirationTime(undefined)).toBeNull()
        })

        it('should return time until expiration', () => {
            const future = new Date()
            future.setMinutes(future.getMinutes() + 5)
            const time = getExpirationTime(future.toISOString())
            expect(time).toBeGreaterThan(0)
            expect(time).toBeLessThanOrEqual(300000) // Within 5 minutes
        })

        it('should return null for past date', () => {
            const past = new Date()
            past.setFullYear(past.getFullYear() - 1)
            expect(getExpirationTime(past.toISOString())).toBeNull()
        })

        it('should handle invalid date strings', () => {
            expect(getExpirationTime('invalid-date')).toBeNull()
        })
    })
})

