export type ApiKeyRecord = {
	id: string;
	keyHash: string;
	ownerId: string;
	name?: string;
	description?: string;
	scopes?: string[];
	resources?: Record<string, string[]>;
	expiresAt?: Date | string | null;
	createdAt?: string;
	lastUsedAt?: string;
	enabled?: boolean;
	revokedAt?: Date | string | null;
	rotatedTo?: string | null;
	tags?: string[];
};

export type ApiKeyMutableFields = Omit<ApiKeyRecord, "id" | "keyHash">;

/** @deprecated Use ApiKeyMutableFields instead */
export type ApiKeyMetadata = ApiKeyMutableFields;

export type CreateApiKeyInput = {
	prefix?: string;
	length?: number;
	metadata: Partial<ApiKeyMutableFields>;
};
