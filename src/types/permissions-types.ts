export type PermissionScope = string;

export type Permission = {
  scope: PermissionScope;
  description?: string;
};

export type PermissionChecker = {
  hasPermission(
    scopes: PermissionScope[] | undefined,
    required: PermissionScope
  ): boolean;
  hasAnyPermission(
    scopes: PermissionScope[] | undefined,
    required: PermissionScope[]
  ): boolean;
  hasAllPermissions(
    scopes: PermissionScope[] | undefined,
    required: PermissionScope[]
  ): boolean;
};
