import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(() => ({
	root: "src",
	// Defaults to "/"; the GitHub Pages workflow sets DOCS_BASE to the repo
	// subpath so relative asset URLs resolve when deployed under /<repo>/.
	base: process.env.DOCS_BASE || "/",
	build: {
		outDir: "../dist",
		emptyOutDir: true,
		rollupOptions: {
			output: {
				manualChunks(id: string) {
					if (!id.includes("node_modules")) return;
					if (id.includes("shiki") || id.includes("@shikijs")) return "shiki";
					if (
						/[\\/](react|react-dom|react-router|react-reconciler|scheduler|its-fine)[\\/]/.test(
							id,
						)
					) {
						return "react-vendor";
					}
				},
			},
		},
	},
	plugins: [react()],
	define: {
		// Skip schema validation in browser (parser.ts module-level code)
		"process.env.BROWSER": JSON.stringify(true),
	},
	optimizeDeps: {
		// Exclude Node.js built-ins from optimization
		exclude: ["node:fs", "node:path", "node:url"],
	},
}));
