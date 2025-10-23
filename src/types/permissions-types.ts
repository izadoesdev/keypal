export type PermissionScope = string

export interface Permission {
    scope: PermissionScope
    description?: string
}

export interface PermissionChecker {
    hasPermission(scopes: PermissionScope[] | undefined, required: PermissionScope): boolean
    hasAnyPermission(scopes: PermissionScope[] | undefined, required: PermissionScope[]): boolean
    hasAllPermissions(scopes: PermissionScope[] | undefined, required: PermissionScope[]): boolean
}
