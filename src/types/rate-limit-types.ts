/**
 * Configuration for the rate limiter
 */
export type RateLimitConfig = {
	/** Maximum number of requests allowed within the window */
	maxRequests: number;
	/** Window in milliseconds */
	windowMs: number;
	/** Prefix for the key in the cache */
	keyPrefix?: string;
};

/**
 * Result of checking the rate limit
 */
export type RateLimitResult = {
	/** Whether the request is allowed */
	allowed: boolean;
	/** Current request count in the window */
	current: number;
	/** Maximum number of requests allowed within the window */
	limit: number;
	/** Time in milliseconds until the window resets */
	resetMs: number;
	/** ISO timestamp when the window resets */
	resetAt: string;
	/** Number of requests remaining within the window */
	remaining: number;
};

/**
 * Options for checking the rate limit
 */
export type RateLimitCheckOptions = {
	/** Increment the counter (default: true). Set to false for dry-run checks */
	increment?: boolean;
	/** Custom identifier (defaults to API key record ID) */
	identifier?: string;
};
