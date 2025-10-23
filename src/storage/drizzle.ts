import type { Storage, DrizzleColumnMapping } from '../types/storage-types'
import type { ApiKeyRecord, ApiKeyMetadata } from '../types/api-key-types'
import { eq } from 'drizzle-orm'

/**
 * Drizzle ORM storage adapter for API keys
 * Works with any existing database schema through column mapping
 */
export class DrizzleStore implements Storage {
    private db: any // Drizzle database instance
    private table: any // Drizzle table reference
    private columns: Required<DrizzleColumnMapping>

    constructor(options: {
        db: any
        table: any
        columns?: DrizzleColumnMapping
    }) {
        this.db = options.db
        this.table = options.table

        // Default column mapping - users can override
        this.columns = {
            id: options.columns?.id ?? 'id',
            keyHash: options.columns?.keyHash ?? 'keyHash',
            ownerId: options.columns?.ownerId ?? 'ownerId',
            name: options.columns?.name ?? 'name',
            description: options.columns?.description ?? 'description',
            scopes: options.columns?.scopes ?? 'scopes',
            expiresAt: options.columns?.expiresAt ?? 'expiresAt',
            createdAt: options.columns?.createdAt ?? 'createdAt',
            lastUsedAt: options.columns?.lastUsedAt ?? 'lastUsedAt',
        }
    }

    /**
     * Convert database row to ApiKeyRecord
     */
    private rowToRecord(row: any): ApiKeyRecord {
        return {
            id: row[this.columns.id],
            keyHash: row[this.columns.keyHash],
            metadata: {
                ownerId: row[this.columns.ownerId],
                name: row[this.columns.name] ?? undefined,
                description: row[this.columns.description] ?? undefined,
                scopes: row[this.columns.scopes] ? JSON.parse(row[this.columns.scopes]) : undefined,
                expiresAt: row[this.columns.expiresAt] ?? null,
                createdAt: row[this.columns.createdAt] ?? undefined,
                lastUsedAt: row[this.columns.lastUsedAt] ?? undefined,
            },
        }
    }

    /**
     * Convert ApiKeyRecord to database row
     */
    private recordToRow(record: ApiKeyRecord): any {
        return {
            [this.columns.id]: record.id,
            [this.columns.keyHash]: record.keyHash,
            [this.columns.ownerId]: record.metadata.ownerId,
            [this.columns.name]: record.metadata.name ?? null,
            [this.columns.description]: record.metadata.description ?? null,
            [this.columns.scopes]: record.metadata.scopes ? JSON.stringify(record.metadata.scopes) : null,
            [this.columns.expiresAt]: record.metadata.expiresAt ?? null,
            [this.columns.createdAt]: record.metadata.createdAt ?? null,
            [this.columns.lastUsedAt]: record.metadata.lastUsedAt ?? null,
        }
    }

    async save(record: ApiKeyRecord): Promise<void> {
        const row = this.recordToRow(record)
        await this.db.insert(this.table).values(row)
    }

    async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {

        const rows = await this.db
            .select()
            .from(this.table)
            .where(eq(this.table[this.columns.keyHash], keyHash))
            .limit(1)

        return rows.length > 0 ? this.rowToRecord(rows[0]) : null
    }

    async findById(id: string): Promise<ApiKeyRecord | null> {

        const rows = await this.db
            .select()
            .from(this.table)
            .where(eq(this.table[this.columns.id], id))
            .limit(1)

        return rows.length > 0 ? this.rowToRecord(rows[0]) : null
    }

    async findByOwner(ownerId: string): Promise<ApiKeyRecord[]> {

        const rows = await this.db
            .select()
            .from(this.table)
            .where(eq(this.table[this.columns.ownerId], ownerId))

        return rows.map((row: any) => this.rowToRecord(row))
    }

    async updateMetadata(id: string, metadata: Partial<ApiKeyMetadata>): Promise<void> {

        const updates: any = {}

        if (metadata.name !== undefined) {
            updates[this.columns.name] = metadata.name
        }
        if (metadata.description !== undefined) {
            updates[this.columns.description] = metadata.description
        }
        if (metadata.scopes !== undefined) {
            updates[this.columns.scopes] = JSON.stringify(metadata.scopes)
        }
        if (metadata.expiresAt !== undefined) {
            updates[this.columns.expiresAt] = metadata.expiresAt
        }
        if (metadata.lastUsedAt !== undefined) {
            updates[this.columns.lastUsedAt] = metadata.lastUsedAt
        }

        await this.db
            .update(this.table)
            .set(updates)
            .where(eq(this.table[this.columns.id], id))
    }

    async delete(id: string): Promise<void> {

        await this.db
            .delete(this.table)
            .where(eq(this.table[this.columns.id], id))
    }

    async deleteByOwner(ownerId: string): Promise<void> {

        await this.db
            .delete(this.table)
            .where(eq(this.table[this.columns.ownerId], ownerId))
    }
}

