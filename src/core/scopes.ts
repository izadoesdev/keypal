import type { PermissionScope } from "../types/permissions-types";

export type ScopeCheckOptions = {
	resource?: string;
	resources?: Record<string, PermissionScope[]>;
};

export function hasScope(
	scopes: PermissionScope[] | undefined,
	requiredScope: PermissionScope,
	options?: ScopeCheckOptions
): boolean {
	if (scopes?.includes(requiredScope)) {
		return true;
	}

	if (options?.resource && options.resources) {
		const resourceScopes = options.resources[options.resource];
		if (resourceScopes?.includes(requiredScope)) {
			return true;
		}
	}

	return false;
}

export function hasAnyScope(
	scopes: PermissionScope[] | undefined,
	requiredScopes: PermissionScope[],
	options?: ScopeCheckOptions
): boolean {
	if (scopes && requiredScopes.some((s) => scopes.includes(s))) {
		return true;
	}

	if (options?.resource && options.resources) {
		const resourceScopes = options.resources[options.resource];
		if (resourceScopes && requiredScopes.some((s) => resourceScopes.includes(s))) {
			return true;
		}
	}

	return false;
}

export function hasAllScopes(
	scopes: PermissionScope[] | undefined,
	requiredScopes: PermissionScope[],
	options?: ScopeCheckOptions
): boolean {
	if (scopes && requiredScopes.every((s) => scopes.includes(s))) {
		return true;
	}

	if (options?.resource && options.resources) {
		const resourceScopes = options.resources[options.resource];
		if (resourceScopes) {
			if (requiredScopes.every((s) => resourceScopes.includes(s))) {
				return true;
			}
			const combined = [...(scopes || []), ...resourceScopes];
			return requiredScopes.every((s) => combined.includes(s));
		}
	}

	return false;
}

/** @deprecated Use `hasScope` with `options.resources` instead */
export function hasScopeWithResources(
	globalScopes: PermissionScope[] | undefined,
	resources: Record<string, PermissionScope[]> | undefined,
	requiredScope: PermissionScope,
	options?: ScopeCheckOptions
): boolean {
	return hasScope(globalScopes, requiredScope, { ...options, resources });
}

/** @deprecated Use `hasAnyScope` with `options.resources` instead */
export function hasAnyScopeWithResources(
	globalScopes: PermissionScope[] | undefined,
	resources: Record<string, PermissionScope[]> | undefined,
	requiredScopes: PermissionScope[],
	options?: ScopeCheckOptions
): boolean {
	return hasAnyScope(globalScopes, requiredScopes, { ...options, resources });
}

/** @deprecated Use `hasAllScopes` with `options.resources` instead */
export function hasAllScopesWithResources(
	globalScopes: PermissionScope[] | undefined,
	resources: Record<string, PermissionScope[]> | undefined,
	requiredScopes: PermissionScope[],
	options?: ScopeCheckOptions
): boolean {
	return hasAllScopes(globalScopes, requiredScopes, { ...options, resources });
}
