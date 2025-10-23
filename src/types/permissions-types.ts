import { Type, type Static } from 'typebox'

/**
 * Common permission scopes for API keys
 */
export const PermissionScopes = [
    'read',
    'write',
    'delete',
    'admin',
] as const

export type PermissionScope = typeof PermissionScopes[number]

/**
 * Schema for validating permission scopes
 */
export const ScopesSchema = Type.Array(Type.Union([
    Type.Literal('read'),
    Type.Literal('write'),
    Type.Literal('delete'),
    Type.Literal('admin'),
]))

export type Scopes = Static<typeof ScopesSchema>

/**
 * Permission object with scope and optional resource restrictions
 */
export const PermissionSchema = Type.Object({
    /** The permission scope */
    scope: Type.Union([
        Type.Literal('read'),
        Type.Literal('write'),
        Type.Literal('delete'),
        Type.Literal('admin'),
    ]),

    /** Optional resource pattern (e.g., "users:*", "orders:123") */
    resource: Type.Optional(Type.String()),
})

export type Permission = Static<typeof PermissionSchema>

/**
 * Check if a key has a specific permission
 */
export interface PermissionChecker {
    /** Check if the key has a specific scope */
    hasScope(scope: PermissionScope): boolean

    /** Check if the key has permission for a specific resource */
    hasPermission(scope: PermissionScope, resource?: string): boolean
}

