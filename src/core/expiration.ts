export function isExpired(expiresAt: string | null | undefined): boolean {
	if (!expiresAt) {
		return false;
	}
	return new Date(expiresAt) <= new Date();
}

export function getExpirationTime(
	expiresAt: string | null | undefined
): Date | null {
	return expiresAt ? new Date(expiresAt) : null;
}
