import { defineConfig } from "tsdown";

export default defineConfig({
	clean: true,
	deps: {
		neverBundle: ["elysia", "next"],
	},
	dts: true,
	entry: {
		browser: "./src/browser.ts",
		elysia: "./src/elysia.ts",
		index: "./src/index.ts",
		next: "./src/next.ts",
		server: "./src/server.ts",
	},
	format: "esm",
	hash: false,
	outDir: "./dist",
	outputOptions: {
		chunkFileNames: "chunks/[name].mjs",
	},
	sourcemap: false,
	tsconfig: "./tsconfig.build.json",
});
