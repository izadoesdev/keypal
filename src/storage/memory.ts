import type { Storage } from '../types/storage-types'
import type { ApiKeyRecord, ApiKeyMetadata } from '../types/api-key-types'

export class MemoryStore implements Storage {
    private keys: Map<string, ApiKeyRecord> = new Map()

    async save(record: ApiKeyRecord): Promise<void> {
        this.keys.set(record.id, record)
    }

    async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
        for (const record of this.keys.values()) {
            if (record.keyHash === keyHash) return record
        }
        return null
    }

    async findById(id: string): Promise<ApiKeyRecord | null> {
        return this.keys.get(id) ?? null
    }

    async findByOwner(ownerId: string): Promise<ApiKeyRecord[]> {
        return Array.from(this.keys.values()).filter(
            (record) => record.metadata.ownerId === ownerId
        )
    }

    async updateMetadata(id: string, metadata: Partial<ApiKeyMetadata>): Promise<void> {
        const record = this.keys.get(id)
        if (record) {
            record.metadata = { ...record.metadata, ...metadata }
        }
    }

    async delete(id: string): Promise<void> {
        this.keys.delete(id)
    }

    async deleteByOwner(ownerId: string): Promise<void> {
        for (const [id, record] of this.keys.entries()) {
            if (record.metadata.ownerId === ownerId) {
                this.keys.delete(id)
            }
        }
    }
}
