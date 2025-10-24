import { createHash } from "node:crypto";

export type HashAlgorithm = "sha256" | "sha512";

export type HashKeyOptions = {
	algorithm?: HashAlgorithm;
	salt?: string;
};

export function hashKey(key: string, options: HashKeyOptions = {}): string {
	const { algorithm = "sha256", salt = "" } = options;
	const input = salt ? `${key}${salt}` : key;
	return createHash(algorithm).update(input).digest("hex");
}
