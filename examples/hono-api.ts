import { type Context, Hono } from "hono";
import { type ApiKeyRecord, createKeys } from "../src/index";

// Define context variables type
type Variables = {
	keyRecord: ApiKeyRecord;
};

// Initialize with defaults (MemoryStore is automatic)
const keys = createKeys({
	prefix: "sk_",
});

const app = new Hono<{ Variables: Variables }>();

// Simplified middleware using verify()
const requireAuth = async (
	c: Context<{ Variables: Variables }>,
	next: () => Promise<void>
) => {
	const authHeader = c.req.header("Authorization");

	if (!authHeader) {
		return c.json({ error: "Missing Authorization header" }, 401);
	}

	// Single-step verification
	const result = await keys.verify(authHeader);

	if (!(result.valid && result.record)) {
		return c.json({ error: result.error || "Invalid API key" }, 401);
	}

	// Attach to context
	c.set("keyRecord", result.record);
	await next();
};

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// Create a new API key (simplified)
app.post("/keys", async (c) => {
	try {
		const body = await c.req.json<{
			ownerId?: string;
			name?: string;
			description?: string;
			scopes?: string[];
			expiresAt?: string;
		}>();

		const { ownerId, name, description, scopes, expiresAt } = body;

		// Validate required fields
		if (!ownerId || typeof ownerId !== "string" || ownerId.trim() === "") {
			return c.json(
				{ error: "ownerId is required and must be a non-empty string" },
				400
			);
		}

		// Validate optional fields
		if (name !== undefined && typeof name !== "string") {
			return c.json({ error: "name must be a string" }, 400);
		}

		if (description !== undefined && typeof description !== "string") {
			return c.json({ error: "description must be a string" }, 400);
		}

		if (
			scopes !== undefined &&
			!(Array.isArray(scopes) && scopes.every((s) => typeof s === "string"))
		) {
			return c.json({ error: "scopes must be an array of strings" }, 400);
		}

		// Validate and parse expiresAt
		let expiresAtISO: string | undefined;
		if (expiresAt) {
			const expiryDate = new Date(expiresAt);
			if (isNaN(expiryDate.getTime())) {
				return c.json(
					{ error: "expiresAt must be a valid ISO date string" },
					400
				);
			}
			if (expiryDate <= new Date()) {
				return c.json({ error: "expiresAt must be a future date" }, 400);
			}
			expiresAtISO = expiryDate.toISOString();
		}

		// Create key (returns both key and record)
		const { key, record } = await keys.create({
			ownerId: ownerId.trim(),
			name: name?.trim(),
			description: description?.trim(),
			scopes,
			expiresAt: expiresAtISO,
		});

		// Return the plain text key (only shown once!)
		return c.json(
			{
				id: record.id,
				key,
				expiresAt: record.metadata.expiresAt,
				createdAt: record.metadata.createdAt,
			},
			201
		);
	} catch (error) {
		console.error("Error creating API key:", error);
		return c.json({ error: "Failed to create API key" }, 500);
	}
});

// List all keys for an owner (requires auth)
app.get("/keys/:ownerId", requireAuth, async (c) => {
	const ownerId = c.req.param("ownerId");

	if (!ownerId || ownerId.trim() === "") {
		return c.json({ error: "ownerId parameter is required" }, 400);
	}

	const currentKey = c.get("keyRecord");

	// Only allow if the requester owns the keys or has admin scope
	if (
		currentKey.metadata.ownerId !== ownerId &&
		!keys.hasScope(currentKey, "admin")
	) {
		return c.json({ error: "Unauthorized" }, 403);
	}

	const keyList = await keys.list(ownerId);

	// Don't return the actual key hashes
	return c.json(
		keyList.map((k) => ({
			id: k.id,
			name: k.metadata.name,
			description: k.metadata.description,
			scopes: k.metadata.scopes,
			expiresAt: k.metadata.expiresAt,
			createdAt: k.metadata.createdAt,
			lastUsedAt: k.metadata.lastUsedAt,
			isExpired: keys.isExpired(k),
		}))
	);
});

// Revoke an API key
app.delete("/keys/:id", requireAuth, async (c) => {
	const id = c.req.param("id");

	if (!id || id.trim() === "") {
		return c.json({ error: "id parameter is required" }, 400);
	}

	const currentKey = c.get("keyRecord");

	// Get the key to delete
	const keyToDelete = await keys.findById(id);

	if (!keyToDelete) {
		return c.json({ error: "Key not found" }, 404);
	}

	// Only allow if owner or admin
	if (
		keyToDelete.metadata.ownerId !== currentKey.metadata.ownerId &&
		!keys.hasScope(currentKey, "admin")
	) {
		return c.json({ error: "Unauthorized" }, 403);
	}

	await keys.revoke(id);
	return c.json({ message: "Key revoked successfully" });
});

// Validate an API key
app.post("/keys/validate", async (c) => {
	try {
		const body = await c.req.json<{ key?: string }>();
		const { key } = body;

		if (!key || typeof key !== "string" || key.trim() === "") {
			return c.json(
				{ error: "Key is required and must be a non-empty string" },
				400
			);
		}

		// Use verify for validation
		const result = await keys.verify(key);

		if (!(result.valid && result.record)) {
			return c.json({
				valid: false,
				reason: result.error || "Invalid key",
			});
		}

		return c.json({
			valid: true,
			ownerId: result.record.metadata.ownerId,
			scopes: result.record.metadata.scopes,
			expiresAt: result.record.metadata.expiresAt,
		});
	} catch (error) {
		console.error("Error validating API key:", error);
		return c.json({ error: "Failed to validate API key" }, 500);
	}
});

// Protected route example - requires API key
app.get("/protected", requireAuth, (c) => {
	const record = c.get("keyRecord");

	return c.json({
		message: "This is a protected route",
		authenticatedAs: record.metadata.ownerId,
		scopes: record.metadata.scopes,
	});
});

// Protected route with scope check
app.get("/admin", requireAuth, (c) => {
	const record = c.get("keyRecord");

	if (!keys.hasScope(record, "admin")) {
		return c.json({ error: "Admin scope required" }, 403);
	}

	return c.json({
		message: "Admin access granted",
		adminInfo: "Sensitive admin data here",
	});
});

// Error handler
app.onError((err, c) => {
	console.error("Server error:", err);
	return c.json({ error: "Internal Server Error" }, 500);
});

// Not found handler
app.notFound((c) => c.json({ error: "Not Found" }, 404));

const port = process.env.PORT || 3000;
console.log(`🚀 Server running on http://localhost:${port}`);

export default {
	port,
	fetch: app.fetch,
};
