import { expect, test } from "@playwright/test";

test("Canvas renders SVG elements with console diagnostics", async ({
	page,
}) => {
	const consoleMessages: string[] = [];

	// Capture all console messages
	page.on("console", (msg) => {
		const text = msg.text();
		consoleMessages.push(`[${msg.type()}] ${text}`);
		console.log(`Browser console [${msg.type()}]:`, text);
	});

	// Capture page errors
	page.on("pageerror", (error) => {
		console.error("Page error:", error.message);
		consoleMessages.push(`[error] ${error.message}`);
	});

	// Navigate to the app
	await page.goto("http://localhost:5173");

	// Wait a bit for React to render
	await page.waitForTimeout(2000);

	// Check if we have any SVG elements
	const svgCount = await page.locator("svg").count();
	console.log(`\nFound ${svgCount} SVG elements`);

	// Check if we have any circles
	const circleCount = await page.locator("circle").count();
	console.log(`Found ${circleCount} circle elements`);

	// Get the first Canvas div
	const firstCanvas = page
		.locator("div")
		.filter({ has: page.locator("svg") })
		.first();
	const hasCanvas = (await firstCanvas.count()) > 0;

	if (!hasCanvas) {
		console.log("\n⚠️ No Canvas with SVG found!");
		console.log("Empty div count:", await page.locator("div").count());
	}

	// Print all captured console messages
	console.log("\n=== All Console Messages ===");
	consoleMessages.forEach((msg) => console.log(msg));
	console.log("=== End Console Messages ===\n");

	// Take a screenshot for debugging
	await page.screenshot({
		path: "test-results/canvas-render.png",
		fullPage: true,
	});

	// Basic assertion - we should have at least one SVG
	expect(svgCount).toBeGreaterThan(0);
	expect(circleCount).toBeGreaterThan(0);
});
