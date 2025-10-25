// import { PrismaClient } from "@prisma/client";
// import type { NodePgDatabase } from "drizzle-orm/node-postgres";
// import { drizzle } from "drizzle-orm/node-postgres";
// import type { PgTable } from "drizzle-orm/pg-core";
import type Redis from "ioredis";
// import { Pool } from "pg";
// import { apikey } from "../../src/drizzle/schema";
import { createKeys } from "../../src/index";
// import { DrizzleStore } from "../../src/storage/drizzle";
import { MemoryStore } from "../../src/storage/memory";

// import { PrismaStore } from "../../src/storage/prisma";
// import { RedisStore } from "../../src/storage/redis";

// const pool = new Pool({
// 	connectionString: process.env.DATABASE_URL,
// });

// const db = drizzle(pool, { schema: { apikey } });
// const prisma = new PrismaClient();

declare const redisClient: Redis;

export const memoryKeys = createKeys({
	prefix: "sk_mem_",
	storage: new MemoryStore(),
	cache: true,
	cacheTtl: 60,
	auditLogs: true,
});

// export const redisKeys = createKeys({
// 	prefix: "sk_redis_",
// 	storage: new RedisStore({ client: redisClient }),
// 	cache: true,
// 	cacheTtl: 60,
// 	auditLogs: true,
// });

// export const drizzleKeys = createKeys({
// 	prefix: "sk_drizzle_",
// 	storage: new DrizzleStore({
// 		db: db as NodePgDatabase<Record<string, PgTable>>,
// 		table: apikey,
// 	}),
// 	cache: true,
// 	cacheTtl: 60,
// 	auditLogs: true,
// });

// export const prismaKeys = createKeys({
// 	prefix: "sk_prisma_",
// 	storage: new PrismaStore({ prisma, model: "apiKey" }),
// 	cache: true,
// 	cacheTtl: 60,
// 	auditLogs: true,
// });
