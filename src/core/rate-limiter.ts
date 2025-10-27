import type { ApiKeyRecord } from "../types/api-key-types";
import type {
	RateLimitCheckOptions,
	RateLimitConfig,
	RateLimitResult,
} from "../types/rate-limit-types";
import { MILLISECONDS_PER_SECOND } from "../utils/constants";
import type { Cache } from "./cache";

export class RateLimiter {
	private readonly cache: Cache;
	private readonly config: RateLimitConfig;
	private readonly keyPrefix: string;

	constructor(cache: Cache, config: RateLimitConfig) {
		if (config.windowMs <= 0) {
			throw new Error("windowMs must be a positive number");
		}
		if (config.maxRequests <= 0) {
			throw new Error("maxRequests must be a positive number");
		}

		this.cache = cache;
		this.config = config;
		this.keyPrefix = config.keyPrefix ?? "ratelimit";
	}

	private getWindowKeyData(apiKeyRecord: ApiKeyRecord, identifier?: string) {
		const id = identifier ?? apiKeyRecord.id;
		const now = Date.now();
		const windowStart =
			Math.floor(now / this.config.windowMs) * this.config.windowMs;

		const key = `${this.keyPrefix}:${id}:${windowStart}`;

		return { now, windowStart, key };
	}

	async check(
		apiKeyRecord: ApiKeyRecord,
		options: RateLimitCheckOptions = {}
	): Promise<RateLimitResult> {
		const increment = options.increment ?? true;

		const { now, windowStart, key } = this.getWindowKeyData(
			apiKeyRecord,
			options.identifier
		);

		const resetAt = windowStart + this.config.windowMs;
		const resetMs = resetAt - now;
		const ttlSeconds = Math.ceil(
			this.config.windowMs / MILLISECONDS_PER_SECOND
		);

		if (increment) {
			// Use atomic increment to prevent race conditions
			const newCount = await this.cache.incr(key, ttlSeconds);

			if (newCount > this.config.maxRequests) {
				return {
					allowed: false,
					current: newCount,
					limit: this.config.maxRequests,
					resetMs,
					resetAt: new Date(resetAt).toISOString(),
					remaining: 0,
				};
			}

			return {
				allowed: true,
				current: newCount,
				limit: this.config.maxRequests,
				resetMs,
				resetAt: new Date(resetAt).toISOString(),
				remaining: this.config.maxRequests - newCount,
			};
		}

		// When not incrementing, just check the current value
		const currentValue = await this.cache.get(key);
		const current = currentValue ? Number.parseInt(currentValue, 10) : 0;

		return {
			allowed: current < this.config.maxRequests,
			current,
			limit: this.config.maxRequests,
			resetMs,
			resetAt: new Date(resetAt).toISOString(),
			remaining: Math.max(0, this.config.maxRequests - current),
		};
	}

	async reset(apiKeyRecord: ApiKeyRecord, identifier?: string): Promise<void> {
		const { key } = this.getWindowKeyData(apiKeyRecord, identifier);

		await this.cache.del(key);
	}

	async getCurrentCount(
		apiKeyRecord: ApiKeyRecord,
		identifier?: string
	): Promise<number> {
		const { key } = this.getWindowKeyData(apiKeyRecord, identifier);

		const value = await this.cache.get(key);
		return value ? Number.parseInt(value, 10) : 0;
	}
}
