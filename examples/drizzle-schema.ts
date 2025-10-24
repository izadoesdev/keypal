import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { apikey } from "../src/drizzle/schema";
import { createKeys } from "../src/manager";
import { DrizzleStore } from "../src/storage/drizzle";

const pool = new Pool({
	connectionString:
		process.env.DATABASE_URL ||
		"postgresql://keypal:keypal_dev@localhost:5432/keypal",
});

const db = drizzle(pool, { schema: { apikey } });

export const keys = createKeys({
	prefix: "sk_live_",
	storage: new DrizzleStore({ db, table: apikey }),
	cache: true,
});

export async function createApiKey(ownerId: string, name?: string) {
	return await keys.create({
		ownerId,
		name,
		scopes: ["read", "write"],
	});
}

export async function verifyApiKey(authHeader: string | null) {
	if (!authHeader) {
		return null;
	}

	const key = await keys.verify(authHeader);
	return key;
}
