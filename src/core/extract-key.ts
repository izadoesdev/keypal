export type KeyExtractionOptions = {
	headerNames?: string[];
	extractBearer?: boolean;
};

const DEFAULT_HEADER_NAMES = ["authorization", "x-api-key"];
const BEARER_PREFIX = "bearer ";
const BEARER_PREFIX_LENGTH = 7;

function getHeader(
	headers: Record<string, string | undefined> | Headers,
	name: string
): string | null {
	if (headers instanceof Headers) {
		return headers.get(name);
	}

	const lowerName = name.toLowerCase();
	for (const key in headers) {
		if (key.toLowerCase() === lowerName) {
			return headers[key] ?? null;
		}
	}
	return null;
}

function processHeaderValue(
	value: string,
	extractBearer: boolean
): string | null {
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}

	const lowerValue = trimmed.toLowerCase();

	// Check if it's exactly "bearer" with nothing after
	if (lowerValue === "bearer") {
		return null;
	}

	// Check if it starts with "bearer "
	if (lowerValue.startsWith(BEARER_PREFIX)) {
		if (extractBearer) {
			const token = trimmed.slice(BEARER_PREFIX_LENGTH).trim();
			return token || null;
		}
		return trimmed;
	}

	return trimmed;
}

export function extractKeyFromHeaders(
	headers: Record<string, string | undefined> | Headers,
	options: KeyExtractionOptions = {}
): string | null {
	const { headerNames = DEFAULT_HEADER_NAMES, extractBearer = true } = options;

	for (const headerName of headerNames) {
		const value = getHeader(headers, headerName);
		if (!value) {
			continue;
		}

		const processed = processHeaderValue(value, extractBearer);
		if (processed) {
			return processed;
		}
	}

	return null;
}

export function hasApiKey(
	headers: Record<string, string | undefined> | Headers,
	options: KeyExtractionOptions = {}
): boolean {
	return extractKeyFromHeaders(headers, options) !== null;
}
