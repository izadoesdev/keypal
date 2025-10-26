/**
 * API Key verification error codes
 */
export const ApiKeyErrorCode = {
	/** No API key was provided */
	MISSING_KEY: "MISSING_KEY",

	/** API key format is invalid (e.g., wrong prefix) */
	INVALID_FORMAT: "INVALID_FORMAT",

	/** API key does not exist in storage */
	INVALID_KEY: "INVALID_KEY",

	/** API key has expired */
	EXPIRED: "EXPIRED",

	/** API key has been revoked */
	REVOKED: "REVOKED",

	/** API key is disabled */
	DISABLED: "DISABLED",

	/** Storage error occurred */
	STORAGE_ERROR: "STORAGE_ERROR",

	/** Cache error occurred */
	CACHE_ERROR: "CACHE_ERROR",

	/** Rate limit exceeded */
	RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",

	/** API key is already revoked */
	ALREADY_REVOKED: "ALREADY_REVOKED",

	/** API key is already enabled */
	ALREADY_ENABLED: "ALREADY_ENABLED",

	/** API key is already disabled */
	ALREADY_DISABLED: "ALREADY_DISABLED",

	/** Cannot perform operation on revoked key */
	CANNOT_MODIFY_REVOKED: "CANNOT_MODIFY_REVOKED",

	/** API key not found */
	KEY_NOT_FOUND: "KEY_NOT_FOUND",

	/** Audit logging is not enabled */
	AUDIT_LOGGING_DISABLED: "AUDIT_LOGGING_DISABLED",

	/** Storage does not support this operation */
	STORAGE_NOT_SUPPORTED: "STORAGE_NOT_SUPPORTED",
} as const;

export type ApiKeyErrorCode =
	(typeof ApiKeyErrorCode)[keyof typeof ApiKeyErrorCode];

/**
 * API Key error messages mapped to error codes
 */
export const ApiKeyErrorMessages: Record<ApiKeyErrorCode, string> = {
	[ApiKeyErrorCode.MISSING_KEY]: "Missing API key",
	[ApiKeyErrorCode.INVALID_FORMAT]: "Invalid API key format",
	[ApiKeyErrorCode.INVALID_KEY]: "Invalid API key",
	[ApiKeyErrorCode.EXPIRED]: "API key has expired",
	[ApiKeyErrorCode.REVOKED]: "API key has been revoked",
	[ApiKeyErrorCode.DISABLED]: "API key is disabled",
	[ApiKeyErrorCode.STORAGE_ERROR]: "Storage error occurred",
	[ApiKeyErrorCode.CACHE_ERROR]: "Cache error occurred",
	[ApiKeyErrorCode.RATE_LIMIT_EXCEEDED]: "Rate limit exceeded",
	[ApiKeyErrorCode.ALREADY_REVOKED]: "API key is already revoked",
	[ApiKeyErrorCode.ALREADY_ENABLED]: "API key is already enabled",
	[ApiKeyErrorCode.ALREADY_DISABLED]: "API key is already disabled",
	[ApiKeyErrorCode.CANNOT_MODIFY_REVOKED]: "Cannot modify a revoked key",
	[ApiKeyErrorCode.KEY_NOT_FOUND]: "API key not found",
	[ApiKeyErrorCode.AUDIT_LOGGING_DISABLED]: "Audit logging is not enabled",
	[ApiKeyErrorCode.STORAGE_NOT_SUPPORTED]:
		"Storage does not support this operation",
};

/**
 * API Key error details
 */
export type ApiKeyError = {
	/** Error code for programmatic handling */
	code: ApiKeyErrorCode;
	/** Human-readable error message */
	message: string;
	/** Optional additional error details */
	details?: unknown;
};

/**
 * Helper function to create an API key error
 */
export function createApiKeyError(
	code: ApiKeyErrorCode,
	details?: unknown
): ApiKeyError {
	return {
		code,
		message: ApiKeyErrorMessages[code],
		details,
	};
}

/**
 * Helper function to create a verification result with error
 */
export function createErrorResult(
	code: ApiKeyErrorCode,
	details?: unknown
): { valid: false; error: string; errorCode: ApiKeyErrorCode } {
	const error = createApiKeyError(code, details);
	return {
		valid: false,
		error: error.message,
		errorCode: error.code,
	};
}
