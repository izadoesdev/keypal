import { customAlphabet } from "nanoid";

const defaultAlphabet =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const defaultLength = 32;
// Cache the default generator to avoid recreation
const defaultGenerator = customAlphabet(defaultAlphabet, defaultLength);

export type GenerateKeyOptions = {
	prefix?: string;
	length?: number;
	alphabet?: string;
};

export function generateKey(options: GenerateKeyOptions = {}): string {
	const { prefix = "", length = 32, alphabet = defaultAlphabet } = options;

	// Use cached generator for default case (most common)
	const key =
		length === defaultLength && alphabet === defaultAlphabet
			? defaultGenerator()
			: customAlphabet(alphabet, length)();

	return prefix ? `${prefix}${key}` : key;
}
