import { readFileSync } from "node:fs";
import { defineBuildConfig } from "unbuild";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineBuildConfig({
	entries: [
		"src/index.ts",
		"src/storage/memory.ts",
		"src/storage/redis.ts",
		"src/storage/drizzle.ts",
		"src/storage/prisma.ts",
		"src/storage/kysely.ts",
		"src/drizzle/schema.ts",
	],
	declaration: true,
	clean: true,
	rollup: {
		emitCJS: true,
		esbuild: {
			minify: true,
			treeShaking: true,
		},
		output: {
			banner: `/*!
 * ${pkg.name} v${pkg.version}
 * ${pkg.description}
 * © ${new Date().getFullYear()} "Issa Nassar" <issa@databuddy.cc>
 * Released under the ${pkg.license} License
 * ${pkg.homepage}
 */`,
		},
	},
	externals: [
		"drizzle-orm",
		"drizzle-orm/pg-core",
		"drizzle-orm/node-postgres",
		"@prisma/client",
		"ioredis",
		"kysely",
		"pg",
	],
});
