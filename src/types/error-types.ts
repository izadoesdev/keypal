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
