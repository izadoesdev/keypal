import Redis from 'ioredis'
import type { Storage } from '../types/storage-types'
import type { ApiKeyRecord, ApiKeyMetadata } from '../types/api-key-types'

export interface RedisStoreOptions {
    /** Redis client instance */
    client: Redis
    /** Optional key prefix for all keys (default: 'apikeys:') */
    keyPrefix?: string
}

export class RedisStore implements Storage {
    private client: Redis
    private keyPrefix: string

    constructor(options: RedisStoreOptions) {
        this.client = options.client
        this.keyPrefix = options.keyPrefix ?? 'apikeys:'
    }

    private getKeyId(id: string): string {
        return `${this.keyPrefix}id:${id}`
    }

    private getKeyHash(keyHash: string): string {
        return `${this.keyPrefix}hash:${keyHash}`
    }

    private getKeyOwner(ownerId: string): string {
        return `${this.keyPrefix}owner:${ownerId}`
    }

    async save(record: ApiKeyRecord): Promise<void> {
        const data = JSON.stringify(record)
        const keyId = this.getKeyId(record.id)
        const keyHash = this.getKeyHash(record.keyHash)
        const keyOwner = this.getKeyOwner(record.metadata.ownerId)

        // Save record data with both ID and hash as keys
        await this.client.set(keyId, data)
        await this.client.set(keyHash, record.id) // Map hash to ID for quick lookup

        // Add to owner's set
        await this.client.sadd(keyOwner, record.id)
    }

    async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
        const keyHashKey = this.getKeyHash(keyHash)
        const id = await this.client.get(keyHashKey)

        if (!id) return null

        return this.findById(id)
    }

    async findById(id: string): Promise<ApiKeyRecord | null> {
        const keyId = this.getKeyId(id)
        const data = await this.client.get(keyId)

        if (!data) return null

        return JSON.parse(data) as ApiKeyRecord
    }

    async findByOwner(ownerId: string): Promise<ApiKeyRecord[]> {
        const keyOwner = this.getKeyOwner(ownerId)
        const ids = await this.client.smembers(keyOwner)

        if (ids.length === 0) return []

        const records: ApiKeyRecord[] = []
        for (const id of ids) {
            const record = await this.findById(id)
            if (record) {
                records.push(record)
            }
        }

        return records
    }

    async updateMetadata(id: string, metadata: Partial<ApiKeyMetadata>): Promise<void> {
        const record = await this.findById(id)
        if (!record) return

        const updatedRecord: ApiKeyRecord = {
            ...record,
            metadata: { ...record.metadata, ...metadata },
        }

        const data = JSON.stringify(updatedRecord)
        const keyId = this.getKeyId(id)
        await this.client.set(keyId, data)
    }

    async delete(id: string): Promise<void> {
        const record = await this.findById(id)
        if (!record) return

        const keyId = this.getKeyId(id)
        const keyHash = this.getKeyHash(record.keyHash)
        const keyOwner = this.getKeyOwner(record.metadata.ownerId)

        await this.client.del(keyId)
        await this.client.del(keyHash)
        await this.client.srem(keyOwner, id)
    }

    async deleteByOwner(ownerId: string): Promise<void> {
        const records = await this.findByOwner(ownerId)
        for (const record of records) {
            await this.delete(record.id)
        }
    }
}

