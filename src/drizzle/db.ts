import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { apikey } from "./schema";

export const db = drizzle(
	new Pool({ connectionString: process.env.DATABASE_URL }),
	{
		schema: {
			apikey,
		},
	}
);
