import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "jsdom",
		include: ["src/**/*.{test,spec}.{ts,tsx}"],
		setupFiles: [],
	},
	define: {
		"process.env.NODE_ENV": JSON.stringify("test"),
	},
});
