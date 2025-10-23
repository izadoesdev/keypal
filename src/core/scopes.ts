import type { PermissionScope } from '../types/permissions-types'

export function hasScope(
    scopes: PermissionScope[] | undefined,
    requiredScope: PermissionScope
): boolean {
    return scopes?.includes(requiredScope) ?? false
}

export function hasAnyScope(
    scopes: PermissionScope[] | undefined,
    requiredScopes: PermissionScope[]
): boolean {
    if (!scopes || scopes.length === 0) return false
    return requiredScopes.some((scope) => scopes.includes(scope))
}

export function hasAllScopes(
    scopes: PermissionScope[] | undefined,
    requiredScopes: PermissionScope[]
): boolean {
    if (!scopes || scopes.length === 0) return false
    return requiredScopes.every((scope) => scopes.includes(scope))
}
