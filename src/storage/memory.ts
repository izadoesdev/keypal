import type { ApiKeyMetadata, ApiKeyRecord } from "../types/api-key-types";
import type { Storage } from "../types/storage-types";

export class MemoryStore implements Storage {
	private readonly keys: Map<string, ApiKeyRecord> = new Map();

	async save(record: ApiKeyRecord): Promise<void> {
		const existing = await this.keys.get(record.id);
		if (existing) {
			throw new Error(`API key with id ${record.id} already exists`);
		}
		this.keys.set(record.id, record);
	}

	async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
		for (const record of await this.keys.values()) {
			if (record.keyHash === keyHash) {
				return record;
			}
		}
		return null;
	}

	async findById(id: string): Promise<ApiKeyRecord | null> {
		return (await this.keys.get(id)) ?? null;
	}

	async findByOwner(ownerId: string): Promise<ApiKeyRecord[]> {
		return Array.from(await this.keys.values()).filter(
			(record) => record.metadata.ownerId === ownerId
		);
	}

	async findByTag(tag: string, ownerId?: string): Promise<ApiKeyRecord[]> {
		return await this.findByTags([tag], ownerId);
	}

	async findByTags(tags: string[], ownerId?: string): Promise<ApiKeyRecord[]> {
		return Array.from(await this.keys.values()).filter((record) => {
			if (ownerId && record.metadata.ownerId !== ownerId) {
				return false;
			}
			return tags.some((t) => record.metadata.tags?.includes(t.toLowerCase()));
		});
	}

	async updateMetadata(
		id: string,
		metadata: Partial<ApiKeyMetadata>
	): Promise<void> {
		const record = await this.keys.get(id);
		if (!record) {
			throw new Error(`API key with id ${id} not found`);
		}
		record.metadata = { ...record.metadata, ...metadata };
	}

	async delete(id: string): Promise<void> {
		await this.keys.delete(id);
	}

	async deleteByOwner(ownerId: string): Promise<void> {
		for (const [id, record] of this.keys.entries()) {
			if (record.metadata.ownerId === ownerId) {
				await this.keys.delete(id);
			}
		}
	}
}
