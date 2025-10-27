import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		coverage: {
			provider: "v8",
			exclude: ["src/utils/logger.ts"],
			thresholds: {
				lines: 85,
				functions: 95,
				branches: 80,
				statements: 85,
			},
		},
	},
	resolve: {
		alias: {
			"@src": path.resolve(__dirname, "./src"),
		},
	},
});
