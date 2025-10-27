import { describe, expect, it } from "vitest";
import { getExpirationTime, isExpired } from "@src/core/expiration";

const EXPIRATION_TIME_BUFFER = 5;

describe("expiration", () => {
	describe("isExpired", () => {
		it("should return false for null expiration", () => {
			expect(isExpired(null)).toBe(false);
		});

		it("should return false for undefined expiration", () => {
			expect(isExpired(undefined)).toBe(false);
		});

		it("should return false for future date", () => {
			const future = new Date();
			future.setFullYear(future.getFullYear() + 1);
			expect(isExpired(future.toISOString())).toBe(false);
		});

		it("should return true for past date", () => {
			const past = new Date();
			past.setFullYear(past.getFullYear() - 1);
			expect(isExpired(past.toISOString())).toBe(true);
		});

		it("should return true for current time", () => {
			const now = new Date();
			now.setSeconds(now.getSeconds() - 1);
			expect(isExpired(now.toISOString())).toBe(true);
		});

		it("should handle invalid date strings", () => {
			expect(isExpired("invalid-date")).toBe(false);
		});
	});

	describe("getExpirationTime", () => {
		it("should return null for null expiration", () => {
			expect(getExpirationTime(null)).toBeNull();
		});

		it("should return null for undefined expiration", () => {
			expect(getExpirationTime(undefined)).toBeNull();
		});

		it("should return expiration date", () => {
			const future = new Date();
			future.setMinutes(future.getMinutes() + EXPIRATION_TIME_BUFFER);
			const time = getExpirationTime(future.toISOString());
			expect(time).toBeInstanceOf(Date);
			expect(time?.getTime()).toBeGreaterThan(Date.now());
		});
	});
});
