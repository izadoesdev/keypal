import { sql, type Kysely } from "kysely";
import type { ApiKeyMetadata, ApiKeyRecord } from "../types/api-key-types";
import type { Storage } from "../types/storage-types";

/**
 * Kysely database schema interface for API keys
 */
export type ApiKeysDatabase = {
	apikey: {
		id: string;
		key_hash: string;
		metadata: ApiKeyMetadata;
	};
};

/**
 * PostgreSQL storage adapter for API keys using Kysely
 *
 * **Required Table Columns:**
 * - `id`: TEXT PRIMARY KEY
 * - `key_hash`: TEXT (or `keyHash` in camelCase)
 * - `metadata`: JSONB
 *
 * You can add custom columns - they'll be ignored by this adapter.
 *
 * @example
 * ```typescript
 * import { KyselyStore } from 'keypal/kysely';
 * import { Kysely, PostgresDialect } from 'kysely';
 * import { Pool } from 'pg';
 *
 * const db = new Kysely<Database>({
 *   dialect: new PostgresDialect({ pool: new Pool(...) })
 * });
 *
 * const store = new KyselyStore({ db, table: 'apikey' });
 * ```
 */
export class KyselyStore implements Storage {
	private readonly db: Kysely<ApiKeysDatabase>;
	private readonly table: keyof ApiKeysDatabase;

	constructor(options: { db: Kysely<ApiKeysDatabase>; table: keyof ApiKeysDatabase }) {
		this.db = options.db;
		this.table = options.table;
	}

	private toRecord(
		row: ApiKeysDatabase[keyof ApiKeysDatabase] | undefined
	): ApiKeyRecord | null {
		if (!row) {
			return null;
		}

		return {
			id: row.id,
			keyHash: row.key_hash,
			metadata: row.metadata,
		};
	}

	private toRow(record: ApiKeyRecord): ApiKeysDatabase[keyof ApiKeysDatabase] {
		return {
			id: record.id,
			key_hash: record.keyHash,
			metadata: record.metadata,
		};
	}

	async save(record: ApiKeyRecord): Promise<void> {
		await this.db
			.insertInto(this.table)
			.values(this.toRow(record))
			.execute();
	}

	async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
		const result = await this.db
			.selectFrom(this.table)
			.selectAll()
			.where("key_hash", "=", keyHash)
			.limit(1)
			.executeTakeFirst();

		return this.toRecord(result);
	}

	async findById(id: string): Promise<ApiKeyRecord | null> {
		const result = await this.db
			.selectFrom(this.table)
			.selectAll()
			.where("id", "=", id)
			.limit(1)
			.executeTakeFirst();

		return this.toRecord(result);
	}

	async findByOwner(ownerId: string): Promise<ApiKeyRecord[]> {
		const results = await this.db
			.selectFrom(this.table)
			.selectAll()
			.where(sql<boolean>`metadata @> ${JSON.stringify({ ownerId })}`)
			.execute();

		return results
			.map((row: ApiKeysDatabase[keyof ApiKeysDatabase]) => this.toRecord(row))
			.filter(Boolean) as ApiKeyRecord[];
	}

	async findByTags(tags: string[], ownerId?: string): Promise<ApiKeyRecord[]> {
		if (tags.length === 0 && ownerId === undefined) {
			return [];
		}

		let query = this.db.selectFrom(this.table).selectAll();

		// Build tag conditions (OR logic)
		if (tags.length > 0) {
			const lowercasedTags = tags.map((t) => t.toLowerCase());
			const tagConditions = lowercasedTags.map((tag) =>
				sql<boolean>`metadata @> ${JSON.stringify({ tags: [tag] })}`
			);

			// biome-ignore lint/suspicious/noExplicitAny: Kysely or/eb types are complex
			query = query.where(({ or, eb }: any) =>
				or(tagConditions.map((condition: any) => eb(condition, "is not", null)))
			);
		}

		// Add owner filter (AND logic)
		if (ownerId !== undefined) {
			query = query.where(
				sql<boolean>`metadata @> ${JSON.stringify({ ownerId })}`
			);
		}

		const results = await query.execute();
		return results
			.map((row: ApiKeysDatabase[keyof ApiKeysDatabase]) => this.toRecord(row))
			.filter(Boolean) as ApiKeyRecord[];
	}

	async findByTag(tag: string, ownerId?: string): Promise<ApiKeyRecord[]> {
		return await this.findByTags([tag], ownerId);
	}

	async updateMetadata(
		id: string,
		metadata: Partial<ApiKeyMetadata>
	): Promise<void> {
		const existing = await this.findById(id);
		if (!existing) {
			throw new Error(`API key with id ${id} not found`);
		}

		const updated = { ...existing.metadata, ...metadata };

		await this.db
			.updateTable(this.table)
			.set({ metadata: updated })
			.where("id", "=", id)
			.execute();
	}

	async delete(id: string): Promise<void> {
		await this.db.deleteFrom(this.table).where("id", "=", id).execute();
	}

	async deleteByOwner(ownerId: string): Promise<void> {
		await this.db
			.deleteFrom(this.table)
			.where(sql<boolean>`metadata @> ${JSON.stringify({ ownerId })}`)
			.execute();
	}
}

