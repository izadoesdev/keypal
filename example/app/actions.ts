"use server";

import { memoryKeys } from "@/lib/keys";
import type { PermissionScope } from "../../src/types/permissions-types";

export async function createApiKey(options: {
	ownerId: string;
	name?: string;
	scopes?: PermissionScope[];
	resources?: Record<string, string[]>;
	expiresAt?: string;
}) {
	try {
		const { key, record } = await memoryKeys.create({
			ownerId: options.ownerId,
			name: options.name,
			scopes: options.scopes ?? ["read"],
			resources: options.resources,
			expiresAt: options.expiresAt || null,
		});

		return { success: true, key, record };
	} catch (error) {
		return { success: false, error: String(error) };
	}
}

export async function listApiKeys(ownerId: string) {
	try {
		const keys = await memoryKeys.list(ownerId);
		return { success: true, keys };
	} catch (error) {
		return { success: false, error: String(error) };
	}
}

export async function verifyApiKey(key: string) {
	try {
		const result = await memoryKeys.verify(key);
		return result;
	} catch (error) {
		return { valid: false, error: String(error) };
	}
}

export async function revokeApiKey(id: string) {
	try {
		await memoryKeys.revoke(id);
		return { success: true };
	} catch (error) {
		return { success: false, error: String(error) };
	}
}

export async function enableApiKey(id: string) {
	try {
		await memoryKeys.enable(id);
		return { success: true };
	} catch (error) {
		return { success: false, error: String(error) };
	}
}

export async function disableApiKey(id: string) {
	try {
		await memoryKeys.disable(id);
		return { success: true };
	} catch (error) {
		return { success: false, error: String(error) };
	}
}

export async function getAuditLogs(keyId?: string, ownerId?: string) {
	try {
		const logs = await memoryKeys.getLogs({ keyId, ownerId, limit: 50 });
		return { success: true, logs };
	} catch (error) {
		return { success: false, error: String(error) };
	}
}

export async function rotateApiKey(id: string) {
	try {
		const result = await memoryKeys.rotate(id);
		return { success: true, ...result };
	} catch (error) {
		return { success: false, error: String(error) };
	}
}

export async function verifyApiKeyWithScopes(
	key: string,
	requiredScopes?: PermissionScope[],
	resource?: string
) {
	try {
		const result = await memoryKeys.verify(key);
		if (!(result.valid && result.record)) {
			return result;
		}

		// Check scopes if required
		if (requiredScopes && requiredScopes.length > 0) {
			const hasAllScopes = memoryKeys.hasAllScopes(
				result.record,
				requiredScopes,
				resource ? { resource } : undefined
			);
			if (!hasAllScopes) {
				return {
					valid: false,
					error: "Insufficient permissions",
					errorCode: "INSUFFICIENT_PERMISSIONS",
				};
			}
		}

		return result;
	} catch (error) {
		return { valid: false, error: String(error) };
	}
}
