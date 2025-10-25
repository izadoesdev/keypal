import type { PrismaClient } from "@prisma/client";
import type { ApiKeyMetadata, ApiKeyRecord } from "../types/api-key-types";
import type { Storage } from "../types/storage-types";

/**
 * Prisma storage adapter for API keys
 *
 * **Required Model Fields:**
 * - `id`: String @id
 * - `keyHash`: String @unique
 * - `metadata`: Json
 *
 * You can add custom fields - they'll be ignored by this adapter.
 *
 * @example
 * ```typescript
 * import { PrismaClient } from '@prisma/client';
 * import { PrismaStore } from 'keypal/storage/prisma';
 *
 * const prisma = new PrismaClient();
 * const store = new PrismaStore({ prisma, model: 'apiKey' });
 * ```
 *
 * **Example Prisma Schema:**
 * ```prisma
 * model ApiKey {
 *   id       String @id @default(cuid())
 *   keyHash  String @unique
 *   metadata Json
 *
 *   @@index([keyHash])
 *   @@map("api_keys")
 * }
 * ```
 */
export class PrismaStore implements Storage {
	private readonly prisma: PrismaClient;
	private readonly modelName: string;

	constructor(options: {
		prisma: PrismaClient;
		/** Name of the Prisma model (e.g., 'apiKey' for model ApiKey) */
		model: string;
	}) {
		this.prisma = options.prisma;
		this.modelName = options.model;
	}

	private get model() {
		// biome-ignore lint/suspicious/noExplicitAny: Prisma client has dynamic model access
		return (this.prisma as any)[this.modelName];
	}

	private toRecord(row: {
		id: string;
		keyHash: string;
		metadata: unknown;
	}): ApiKeyRecord {
		return {
			id: row.id,
			keyHash: row.keyHash,
			metadata: row.metadata as ApiKeyMetadata,
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
		await this.model.create({
			data: this.toRow(record),
		});
	}

	async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
		const row = await this.model.findUnique({
			where: { keyHash },
		});

		return row ? this.toRecord(row) : null;
	}

	async findById(id: string): Promise<ApiKeyRecord | null> {
		const row = await this.model.findUnique({
			where: { id },
		});

		return row ? this.toRecord(row) : null;
	}

	async findByOwner(ownerId: string): Promise<ApiKeyRecord[]> {
		const allRows = await this.model.findMany();
		const filtered = allRows.filter(
			(row: { id: string; keyHash: string; metadata: unknown }) => {
				const metadata = this.toRecord(row).metadata;
				return metadata.ownerId === ownerId;
			}
		);

		return filtered.map(
			(row: { id: string; keyHash: string; metadata: unknown }) =>
				this.toRecord(row)
		);
	}

	async findByTags(tags: string[], ownerId?: string): Promise<ApiKeyRecord[]> {
		if (tags.length === 0) {
			return [];
		}

		const lowercasedTags = tags.map((t) => t.toLowerCase());

		// Build the where clause dynamically
		const where: Record<string, unknown> = {
			OR: lowercasedTags.map((tag) => ({
				metadata: {
					path: ["tags"],
					array_contains: tag,
				},
			})),
		};

		// Add ownerId filter if provided
		if (ownerId !== undefined) {
			where.AND = {
				metadata: {
					path: ["ownerId"],
					equals: ownerId,
				},
			};
		}

		const rows = await this.model.findMany({ where });

		return rows.map((row: { id: string; keyHash: string; metadata: unknown }) =>
			this.toRecord(row)
		);
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

		await this.model.update({
			where: { id },
			data: { metadata: updated },
		});
	}

	async delete(id: string): Promise<void> {
		try {
			await this.model.delete({
				where: { id },
			});
		} catch (error) {
			// Prisma throws P2025 when record doesn't exist, make delete idempotent
			// biome-ignore lint/suspicious/noExplicitAny: Prisma error has code property
			if ((error as any)?.code !== "P2025") {
				throw error;
			}
		}
	}

	async deleteByOwner(ownerId: string): Promise<void> {
		// First find all keys for this owner, then delete them
		const records = await this.findByOwner(ownerId);
		await Promise.all(records.map((record) => this.delete(record.id)));
	}
}
