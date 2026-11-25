import { defineConfig } from "vitest/config";

// Playwright owns tests/; vitest only runs the specs beside the examples
export default defineConfig({
	test: { include: ["src/**/*.spec.{ts,tsx}"] },
});
