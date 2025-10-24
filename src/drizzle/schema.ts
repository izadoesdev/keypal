import { index, jsonb, pgTable, text, unique } from "drizzle-orm/pg-core";

/**
 * Drizzle schema definition for API key storage
 *
 * Table columns:
 * - id: Unique identifier (TEXT PRIMARY KEY)
 * - keyHash: SHA-256 hash of the API key (TEXT, indexed)
 * - metadata: Additional key metadata (JSONB)
 *
 * @example
 * ```ts
 * import { apikey } from 'keypal/drizzle/schema'
 * import { drizzle } from 'drizzle-orm/node-postgres'
 * import { Pool } from 'pg'
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL })
 * const db = drizzle(pool)
 *
 * import { DrizzleStore } from 'keypal/storage/drizzle'
 * const store = new DrizzleStore({ db, table: apikey })
 * ```
 */
export const apikey = pgTable(
	"apikey",
	{
		id: text().primaryKey().notNull(),
		keyHash: text("key_hash").notNull(),
		metadata: jsonb("metadata").notNull(),
	},
	(table) => [
		index("apikey_key_hash_idx").on(table.keyHash),
		unique("apikey_key_hash_unique").on(table.keyHash),
	]
);
