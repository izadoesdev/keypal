import type { PermissionScope } from '../types/permissions-types'

export interface ScopeCheckOptions {
    /** Resource identifier to check resource-specific scopes (e.g., "website:123", "project:456") */
    resource?: string
}

export function hasScope(
    scopes: PermissionScope[] | undefined,
    requiredScope: PermissionScope,
    options?: ScopeCheckOptions
): boolean {
    // Check global scopes first
    if (scopes?.includes(requiredScope)) {
        return true
    }

    // No resource context provided, only check global scopes
    if (!options?.resource) {
        return false
    }

    // This function only checks arrays - resource checking happens at manager level
    return false
}

export function hasAnyScope(
    scopes: PermissionScope[] | undefined,
    requiredScopes: PermissionScope[],
    options?: ScopeCheckOptions
): boolean {
    if (!scopes || scopes.length === 0) return false

    // Check if any required scope exists in global scopes
    const hasGlobalScope = requiredScopes.some((scope) => scopes.includes(scope))
    if (hasGlobalScope) {
        return true
    }

    // No resource context provided, only check global scopes
    if (!options?.resource) {
        return false
    }

    // This function only checks arrays - resource checking happens at manager level
    return false
}

export function hasAllScopes(
    scopes: PermissionScope[] | undefined,
    requiredScopes: PermissionScope[],
    options?: ScopeCheckOptions
): boolean {
    if (!scopes || scopes.length === 0) return false

    // Check if all required scopes exist in global scopes
    const hasAllGlobalScopes = requiredScopes.every((scope) => scopes.includes(scope))
    if (hasAllGlobalScopes) {
        return true
    }

    // No resource context provided, only check global scopes
    if (!options?.resource) {
        return false
    }

    // This function only checks arrays - resource checking happens at manager level
    return false
}

/**
 * Check if a scope exists in either global scopes or resource-specific scopes
 */
export function hasScopeWithResources(
    globalScopes: PermissionScope[] | undefined,
    resources: Record<string, PermissionScope[]> | undefined,
    requiredScope: PermissionScope,
    options?: ScopeCheckOptions
): boolean {
    // Check global scopes first
    if (globalScopes?.includes(requiredScope)) {
        return true
    }

    // If resource is specified, check resource-specific scopes
    if (options?.resource && resources) {
        const resourceScopes = resources[options.resource]
        if (resourceScopes?.includes(requiredScope)) {
            return true
        }
    }

    return false
}

/**
 * Check if any of the required scopes exist in either global or resource-specific scopes
 */
export function hasAnyScopeWithResources(
    globalScopes: PermissionScope[] | undefined,
    resources: Record<string, PermissionScope[]> | undefined,
    requiredScopes: PermissionScope[],
    options?: ScopeCheckOptions
): boolean {
    // Check global scopes
    if (globalScopes && requiredScopes.some((scope) => globalScopes.includes(scope))) {
        return true
    }

    // If resource is specified, check resource-specific scopes
    if (options?.resource && resources) {
        const resourceScopes = resources[options.resource]
        if (resourceScopes && requiredScopes.some((scope) => resourceScopes.includes(scope))) {
            return true
        }
    }

    return false
}

/**
 * Check if all required scopes exist in either global or resource-specific scopes
 */
export function hasAllScopesWithResources(
    globalScopes: PermissionScope[] | undefined,
    resources: Record<string, PermissionScope[]> | undefined,
    requiredScopes: PermissionScope[],
    options?: ScopeCheckOptions
): boolean {
    // Check if all scopes exist in global scopes
    if (globalScopes && requiredScopes.every((scope) => globalScopes.includes(scope))) {
        return true
    }

    if (options?.resource && resources) {
        const resourceScopes = resources[options.resource]
        if (resourceScopes && requiredScopes.every((scope) => resourceScopes.includes(scope))) {
            return true
        }
    }

    if (options?.resource && resources) {
        const resourceScopes = resources[options.resource] || []
        const combinedScopes = [...(globalScopes || []), ...resourceScopes]
        return requiredScopes.every((scope) => combinedScopes.includes(scope))
    }

    return false
}
