import { and, arrayContains, eq, type SQL, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgTable } from "drizzle-orm/pg-core";
import type { apikey } from "../drizzle/schema";
import type { ApiKeyMetadata, ApiKeyRecord } from "../types/api-key-types";
import type { Storage } from "../types/storage-types";

/**
 * PostgreSQL storage adapter for API keys using Drizzle ORM
 *
 * Stores API keys with the following structure:
 * - id: Primary key identifier
 * - keyHash: SHA-256 hash of the API key
 * - metadata: JSONB field containing owner, scopes, and other metadata
 */
export class DrizzleStore implements Storage {
	private readonly db: NodePgDatabase<Record<string, PgTable>>;
	private readonly table: typeof apikey;

	constructor(options: {
		db: NodePgDatabase<Record<string, PgTable>>;
		table: typeof apikey;
	}) {
		this.db = options.db;
		this.table = options.table;
	}

	private toRecord(row: Record<string, unknown>): ApiKeyRecord {
		const metadata =
			typeof row.metadata === "string"
				? JSON.parse(row.metadata)
				: row.metadata;

		return {
			id: row.id as string,
			keyHash: row.keyHash as string,
			metadata: metadata as ApiKeyMetadata,
		};
	}

	private toRow(record: ApiKeyRecord): typeof apikey.$inferSelect {
		return {
			id: record.id,
			keyHash: record.keyHash,
			metadata: record.metadata,
		};
	}

	async save(record: ApiKeyRecord): Promise<void> {
		await this.db.insert(this.table).values(this.toRow(record));
	}

	async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
		const rows = await this.db
			.select()
			.from(this.table)
			.where(eq(this.table.keyHash, keyHash))
			.limit(1);

		return rows.length > 0 && rows[0] ? this.toRecord(rows[0]) : null;
	}

	async findById(id: string): Promise<ApiKeyRecord | null> {
		const rows = await this.db
			.select()
			.from(this.table)
			.where(eq(this.table.id, id))
			.limit(1);

		return rows.length > 0 && rows[0] ? this.toRecord(rows[0]) : null;
	}

	async findByOwner(ownerId: string): Promise<ApiKeyRecord[]> {
		const rows = await this.db
			.select()
			.from(this.table)
			.where(arrayContains(this.table.metadata, { ownerId }));

		return rows.map(this.toRecord);
	}

	async findByTag(
		tag: string | string[],
		ownerId?: string
	): Promise<ApiKeyRecord[]> {
		const tagArray = Array.isArray(tag)
			? tag.map((t) => t.toLowerCase())
			: [tag.toLowerCase()];

		const conditions: SQL[] = [];

		if (tagArray.length > 0) {
			// case insensitive tag matching
			conditions.push(
				sql`${this.table.metadata}->'tags' ?| ARRAY[${tagArray.join(",")}]`
			);
		}

		if (ownerId) {
			conditions.push(arrayContains(this.table.metadata, { ownerId }));
		}

		const rows = await this.db
			.select()
			.from(this.table)
			.where(and(...conditions));

		return rows.map(this.toRecord);
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
			.update(this.table)
			.set({ metadata: updated })
			.where(eq(this.table.id, id));
	}

	async delete(id: string): Promise<void> {
		await this.db.delete(this.table).where(eq(this.table.id, id));
	}

	async deleteByOwner(ownerId: string): Promise<void> {
		await this.db
			.delete(this.table)
			.where(arrayContains(this.table.metadata, { ownerId }));
	}
}
