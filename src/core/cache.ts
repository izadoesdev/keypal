import type Redis from "ioredis";

export type Cache = {
  get(key: string): Promise<string | null> | string | null;
  set(key: string, value: string, ttl?: number): Promise<void> | void;
  del(key: string): Promise<void> | void;
};

export class MemoryCache implements Cache {
  private readonly cache = new Map<
    string,
    { value: string; expires: number }
  >();

  get(key: string): string | null {
    const item = this.cache.get(key);
    if (!item) {
      return null;
    }

    if (item.expires < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  set(key: string, value: string, ttl = 60): void {
    this.cache.set(key, {
      value,
      // biome-ignore lint/style/noMagicNumbers: 1000ms to seconds
      expires: Date.now() + ttl * 1000,
    });
  }

  del(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

export class RedisCache implements Cache {
  private readonly client: Redis;

  constructor(client: Redis) {
    this.client = client;
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  async set(key: string, value: string, ttl = 60): Promise<void> {
    await this.client.setex(key, ttl, value);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }
}
