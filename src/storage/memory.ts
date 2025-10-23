import type { Storage } from '../types/storage-types'
import type { ApiKeyRecord, ApiKeyMetadata } from '../types/api-key-types'

export class MemoryStore implements Storage {
    private data: Map<string, ApiKeyRecord> = new Map()
    private hashIndex: Map<string, string> = new Map() // keyHash -> id

    async save(record: ApiKeyRecord): Promise<void> {
        this.data.set(record.id, record)
        this.hashIndex.set(record.keyHash, record.id)
    }

    async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
        const id = this.hashIndex.get(keyHash)
        if (!id) return null
        return this.data.get(id) ?? null
    }

    async findById(id: string): Promise<ApiKeyRecord | null> {
        return this.data.get(id) ?? null
    }

    async findByOwner(ownerId: string): Promise<ApiKeyRecord[]> {
        return Array.from(this.data.values()).filter(
            record => record.metadata.ownerId === ownerId
        )
    }

    async updateMetadata(id: string, metadata: Partial<ApiKeyMetadata>): Promise<void> {
        const record = this.data.get(id)
        if (!record) return

        this.data.set(id, {
            ...record,
            metadata: { ...record.metadata, ...metadata },
        })
    }

    async delete(id: string): Promise<void> {
        const record = this.data.get(id)
        if (record) {
            this.hashIndex.delete(record.keyHash)
            this.data.delete(id)
        }
    }

    async deleteByOwner(ownerId: string): Promise<void> {
        const records = await this.findByOwner(ownerId)
        for (const record of records) {
            await this.delete(record.id)
        }
    }
}

