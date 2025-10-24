import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./src/drizzle/schema.ts",
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		url:
			process.env.DATABASE_URL ||
			"postgresql://keypal:keypal_dev@localhost:5432/keypal",
	},
});
