import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
	entries: [
		"src/index.ts",
		"src/storage/memory.ts",
		"src/storage/redis.ts",
		"src/storage/drizzle.ts",
		"src/drizzle/index.ts",
	],
	declaration: true,
	clean: true,
	rollup: {
		emitCJS: true,
		esbuild: {
			minify: true,
			treeShaking: true,
		},
	},
});
