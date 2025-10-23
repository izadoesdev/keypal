import type { PermissionScope } from '../types/permissions-types'

/**
 * Check if a key has a specific scope
 */
export function hasScope(scopes: string[] | undefined, scope: PermissionScope): boolean {
    if (!scopes) return false
    return scopes.includes(scope)
}

/**
 * Check if a key has any of the provided scopes
 */
export function hasAnyScope(scopes: string[] | undefined, requiredScopes: PermissionScope[]): boolean {
    if (!scopes) return false
    return requiredScopes.some(scope => scopes.includes(scope))
}

/**
 * Check if a key has all of the provided scopes
 */
export function hasAllScopes(scopes: string[] | undefined, requiredScopes: PermissionScope[]): boolean {
    if (!scopes) return false
    return requiredScopes.every(scope => scopes.includes(scope))
}

