export function isExpired(
	expiresAt: Date | string | null | undefined
): boolean {
	if (!expiresAt) {
		return false;
	}
	const date = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
	return date <= new Date();
}

export function getExpirationTime(
	expiresAt: Date | string | null | undefined
): Date | null {
	if (!expiresAt) return null;
	return expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
}
