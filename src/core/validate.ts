import { timingSafeEqual } from "node:crypto";
import { type HashKeyOptions, hashKey } from "./hash";

export function validateKey(
	key: string,
	storedHash: string,
	options: HashKeyOptions = {}
): boolean {
	const computedHash = hashKey(key, options);

	if (computedHash.length !== storedHash.length) {
		return false;
	}

	return timingSafeEqual(Buffer.from(computedHash), Buffer.from(storedHash));
}
