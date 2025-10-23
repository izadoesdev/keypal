import type { PermissionScope } from '../types/permissions-types'

/**
 * Fluent API for building resource-specific scopes
 * 
 * @example
 * ```ts
 * const resources = new ResourceBuilder()
 *   .add('website', 'site123', ['read', 'write'])
 *   .add('project', 'proj456', ['deploy'])
 *   .build()
 * ```
 */
export class ResourceBuilder {
    private resources: Record<string, PermissionScope[]> = {}

    /**
     * Add scopes for a specific resource
     * @param resourceType - Type of resource (e.g., 'website', 'project', 'team')
     * @param resourceId - ID of the resource
     * @param scopes - Array of scopes to grant for this resource
     */
    add(resourceType: string, resourceId: string, scopes: PermissionScope[]): this {
        const key = `${resourceType}:${resourceId}`

        if (this.resources[key]) {
            // Merge with existing scopes, avoiding duplicates
            const existingScopes = new Set(this.resources[key])
            for (const scope of scopes) {
                existingScopes.add(scope)
            }
            this.resources[key] = Array.from(existingScopes)
        } else {
            this.resources[key] = [...scopes]
        }

        return this
    }

    /**
     * Add a single scope to a resource
     * @param resourceType - Type of resource
     * @param resourceId - ID of the resource
     * @param scope - Single scope to grant
     */
    addOne(resourceType: string, resourceId: string, scope: PermissionScope): this {
        return this.add(resourceType, resourceId, [scope])
    }

    /**
     * Add scopes to multiple resources of the same type
     * @param resourceType - Type of resource
     * @param resourceIds - Array of resource IDs
     * @param scopes - Scopes to grant to all resources
     */
    addMany(resourceType: string, resourceIds: string[], scopes: PermissionScope[]): this {
        for (const resourceId of resourceIds) {
            this.add(resourceType, resourceId, scopes)
        }
        return this
    }

    /**
     * Remove a resource entirely
     */
    remove(resourceType: string, resourceId: string): this {
        const key = `${resourceType}:${resourceId}`
        delete this.resources[key]
        return this
    }

    /**
     * Remove specific scopes from a resource
     */
    removeScopes(resourceType: string, resourceId: string, scopes: PermissionScope[]): this {
        const key = `${resourceType}:${resourceId}`
        if (this.resources[key]) {
            const scopeSet = new Set(scopes)
            this.resources[key] = this.resources[key].filter(s => !scopeSet.has(s))

            // Remove the resource entirely if no scopes left
            if (this.resources[key].length === 0) {
                delete this.resources[key]
            }
        }
        return this
    }

    /**
     * Check if a resource has been added
     */
    has(resourceType: string, resourceId: string): boolean {
        const key = `${resourceType}:${resourceId}`
        return key in this.resources
    }

    /**
     * Get scopes for a specific resource
     */
    get(resourceType: string, resourceId: string): PermissionScope[] {
        const key = `${resourceType}:${resourceId}`
        return this.resources[key] || []
    }

    /**
     * Clear all resources
     */
    clear(): this {
        this.resources = {}
        return this
    }

    /**
     * Build and return the resources object
     */
    build(): Record<string, PermissionScope[]> {
        return { ...this.resources }
    }

    /**
     * Create a new ResourceBuilder from an existing resources object
     */
    static from(resources: Record<string, PermissionScope[]>): ResourceBuilder {
        const builder = new ResourceBuilder()
        builder.resources = { ...resources }
        return builder
    }
}

/**
 * Create a new ResourceBuilder instance
 */
export function createResourceBuilder(): ResourceBuilder {
    return new ResourceBuilder()
}

