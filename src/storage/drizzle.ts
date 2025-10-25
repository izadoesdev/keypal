import { and, arrayContains, eq, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgTable } from "drizzle-orm/pg-core";
import type { ApiKeyMetadata, ApiKeyRecord } from "../types/api-key-types";
import type { Storage } from "../types/storage-types";

/**
 * PostgreSQL storage adapter for API keys using Drizzle ORM
 *
 * **Required Table Columns:**
 * - `id`: TEXT PRIMARY KEY
 * - `keyHash`: TEXT
 * - `metadata`: JSONB
 *
 * You can add custom columns - they'll be ignored by this adapter.
 *
 * @example
 * ```typescript
 * import { apikey } from 'keypal/drizzle/schema';
 * const store = new DrizzleStore({ db, table: apikey });
 * ```
 */
export class DrizzleStore implements Storage {
	private readonly db: NodePgDatabase<Record<string, PgTable>>;
	// biome-ignore lint/suspicious/noExplicitAny: Accept any Drizzle table type
	private readonly table: any;

	constructor(options: {
		db: NodePgDatabase<Record<string, PgTable>>;
		// biome-ignore lint/suspicious/noExplicitAny: Accept any Drizzle table type
		table: any;
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

	private toRow(record: ApiKeyRecord): {
		id: string;
		keyHash: string;
		metadata: ApiKeyMetadata;
	} {
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

	async findByTags(tags: string[], ownerId?: string): Promise<ApiKeyRecord[]> {
		// biome-ignore lint/suspicious/noExplicitAny: arrayContains returns SQL[], TypeScript incorrectly infers undefined
		const conditions: any = [];

		if (tags.length > 0) {
			const lowercasedTags = tags.map((t) => t.toLowerCase());
			const tagConditions = lowercasedTags.map((tag) =>
				arrayContains(this.table.metadata, { tags: [tag] })
			);
			conditions.push(or(...tagConditions));
		}

		if (ownerId !== undefined) {
			conditions.push(arrayContains(this.table.metadata, { ownerId }));
		}

		if (conditions.length === 0) {
			return [];
		}

		const rows = await this.db
			.select()
			.from(this.table)
			.where(and(...conditions));

		return rows.map(this.toRecord);
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
