import { customAlphabet } from "nanoid";

const defaultAlphabet =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export type GenerateKeyOptions = {
	prefix?: string;
	length?: number;
	alphabet?: string;
};

export function generateKey(options: GenerateKeyOptions = {}): string {
	const { prefix = "", length = 32, alphabet = defaultAlphabet } = options;
	const nanoid = customAlphabet(alphabet, length);
	const key = nanoid();
	return prefix ? `${prefix}${key}` : key;
}
