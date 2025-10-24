/**
 * Drizzle ORM integration module for keypal
 *
 * Provides PostgreSQL storage adapter and schema definitions for API key management.
 *
 * @example
 * ```ts
 * import { apikey, DrizzleStore } from 'keypal/drizzle'
 * import { drizzle } from 'drizzle-orm/node-postgres'
 * import { Pool } from 'pg'
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL })
 * const db = drizzle(pool)
 *
 * const store = new DrizzleStore({ db, table: apikey })
 * ```
 */
/** biome-ignore-all lint/performance/noBarrelFile: This is a public API */

export { DrizzleStore } from "../storage/drizzle";
export { apikey } from "./schema";
