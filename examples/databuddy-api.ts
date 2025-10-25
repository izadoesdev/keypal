import { drizzle } from "drizzle-orm/node-postgres";
import { index, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import type { ApiKeyRecord, PermissionScope } from "../src";
import { createKeys } from "../src";
import { DrizzleStore } from "../src/storage/drizzle";

export const apikey = pgTable(
	"apikey",
	{
		id: text().primaryKey().notNull(),
		keyHash: text("key_hash").notNull(),
		metadata: jsonb("metadata").notNull(),
	},
	(table) => [index("apikey_key_hash_idx").on(table.keyHash)]
);

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, { schema: { apikey } });

const keys = createKeys({
	prefix: "dt_bd_sk_",
	storage: new DrizzleStore({ db, table: apikey }),
	cache: true,
});

export async function getKey(headers: Headers): Promise<ApiKeyRecord | null> {
	return await keys.verifyFromHeaders(headers);
}

export function hasKey(headers: Headers): boolean {
	return keys.hasKey(headers);
}

export function hasScope(
	key: ApiKeyRecord | null,
	websiteId: string,
	scope: PermissionScope
): boolean {
	return keys.checkResourceScope(key, "website", websiteId, scope);
}

export function hasAnyScope(
	key: ApiKeyRecord | null,
	websiteId: string,
	scopes: PermissionScope[]
): boolean {
	return keys.checkResourceAnyScope(key, "website", websiteId, scopes);
}

export function hasAllScopes(
	key: ApiKeyRecord | null,
	websiteId: string,
	scopes: PermissionScope[]
): boolean {
	return keys.checkResourceAllScopes(key, "website", websiteId, scopes);
}

export { keys };
