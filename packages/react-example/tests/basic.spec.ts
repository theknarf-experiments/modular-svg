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
	consoleMessages.forEach((msg) => {
		console.log(msg);
	});
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

test("arrows render as straight lines with polygon heads", async ({ page }) => {
	await page.goto("http://localhost:5173/diagrams");
	await page.waitForTimeout(2000);

	// The Full Planet Example draws arrows between labels and planets
	const arrowLines = page.locator('svg line[id*="arrow"]');
	expect(await arrowLines.count()).toBeGreaterThan(0);
	const heads = page.locator("svg polygon");
	expect(await heads.count()).toBeGreaterThan(0);
});

test("every example shows its source code on every page", async ({ page }) => {
	const routes = [
		"/",
		"/interactive",
		"/diagrams",
		"/baking-recipe",
		"/quantum-circuit",
		"/pulley",
	];
	for (const route of routes) {
		await page.goto(`http://localhost:5173${route}`);
		await page.waitForTimeout(1000);
		const sections = await page.locator("section").count();
		expect(sections).toBeGreaterThan(0);
		const codeBlocks = page.locator("section pre code");
		expect(await codeBlocks.count()).toBe(sections);
		const code = await codeBlocks.first().textContent();
		expect(code).toContain("import { Canvas }");
	}
});

test("planet label dropdown retargets the refs", async ({ page }) => {
	await page.goto("http://localhost:5173/diagrams");
	await page.waitForTimeout(2000);

	const label = page.locator('svg text[id="label"]');
	await expect(label).toHaveText("Mercury");

	await page.getByLabel("Label planet").selectOption("venus");
	await expect(label).toHaveText("Venus");

	// arrow still present after retargeting
	expect(await page.locator('svg line[id="arrow1"]').count()).toBe(1);
});

test("the Bluefish gallery examples render on their pages", async ({
	page,
}) => {
	// Baking recipe: the table cell borders exist and the title cell spans them
	await page.goto("http://localhost:5173/baking-recipe");
	await page.waitForTimeout(1500);
	expect(await page.locator('svg rect[id="cb12"]').count()).toBe(1);
	expect(await page.locator('svg rect[id="recipeTable"]').count()).toBe(1);

	// Quantum circuit: control-dot circles and connecting lines
	await page.goto("http://localhost:5173/quantum-circuit");
	await page.waitForTimeout(1500);
	expect(await page.locator('svg circle[id="c1"]').count()).toBe(1);
	expect(await page.locator('svg circle[id="c2"]').count()).toBe(1);

	// Pulley: trapezoid weights are paths, ropes are lines
	await page.goto("http://localhost:5173/pulley");
	await page.waitForTimeout(1500);
	expect(await page.locator('svg path[d*="M 10,0"]').count()).toBe(2);
	expect(await page.locator('svg line[id="l6copy"]').count()).toBe(1);
});
