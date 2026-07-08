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
		"/sequence",
		"/packet",
		"/gitgraph",
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
		expect(code).toContain("import ");
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

test("the sequence diagram renders lifelines, arrows and activations", async ({
	page,
}) => {
	await page.goto("http://localhost:5173/sequence");
	await page.waitForTimeout(1500);

	// lifelines across the three diagrams: 3 (http) + 3 (oauth) + 2 (tcp)
	expect(await page.locator('svg line[stroke-dasharray="4 4"]').count()).toBe(
		8,
	);
	// message shafts: 4 (http, one self-message) + 6 (oauth) + 5 (tcp)
	expect(await page.locator('svg line[id*="-shaft"]').count()).toBe(15);
	// heads: 4 arrow (http) + 6 (oauth incl. open) + 6 (tcp incl. both+cross)
	expect(await page.locator('svg path[id*="-head"]').count()).toBe(16);
	// notes: the spanning http note and the oauth rightOf note
	expect(await page.locator('svg rect[id*="-note"]').count()).toBe(2);
	// frames: the oauth loop frame and the tcp highlight rect
	expect(await page.locator('svg rect[id="frame0"]').count()).toBe(2);
	await expect(page.locator("svg text", { hasText: "loop" })).toBeVisible();
	// autonumber prefixes http labels
	await expect(
		page.locator("svg text", { hasText: "1. GET /planets" }),
	).toBeVisible();
	// activation bars sit exactly on their lifelines (checked within the
	// http-flow diagram: the svg that has an activation bar for Server)
	const httpSvg = page.locator("svg", {
		has: page.locator('rect[id="act-Server"]'),
	});
	const serverBox = await httpSvg
		.locator('rect[id="actor-Server"]')
		.first()
		.boundingBox();
	const serverBar = await httpSvg
		.locator('rect[id="act-Server"]')
		.boundingBox();
	expect(serverBar).toBeTruthy();
	if (serverBar && serverBox) {
		const boxCenter = serverBox.x + serverBox.width / 2;
		const barCenter = serverBar.x + serverBar.width / 2;
		expect(Math.abs(boxCenter - barCenter)).toBeLessThan(1);
	}
});

test("the packet diagram sizes fields by bits and fills rests", async ({
	page,
}) => {
	await page.goto("http://localhost:5173/packet");
	await page.waitForTimeout(1500);

	const tcp = page.locator("svg").first();
	// bounding boxes include the 1px stroke on each side
	const inner = (b: { width: number }) => b.width - 2;
	// Offset (4 bits) is a quarter the width of Source Port (16 bits)
	const srcPort = await tcp.locator('rect[id="cell-0-0"]').boundingBox();
	const offset = await tcp.locator('rect[id="cell-3-0"]').boundingBox();
	expect(srcPort && offset).toBeTruthy();
	if (srcPort && offset) {
		expect(inner(offset)).toBeCloseTo(inner(srcPort) / 4, 0);
	}
	// the rest-filling Options row spans the full 32-bit row width
	const options = await tcp.locator('rect[id="cell-6-0"]').boundingBox();
	if (options && srcPort) {
		expect(inner(options)).toBeCloseTo(inner(srcPort) * 2, 0);
	}
});

test("the git graph renders lanes, edges, and the merge", async ({ page }) => {
	await page.goto("http://localhost:5173/gitgraph");
	await page.waitForTimeout(1500);

	// 7 commit circles in each of the two directions
	await expect(page.locator('svg circle[id*="commit-"]')).toHaveCount(14);
	// 8 edges each (curved paths): 6 first parents + one extra per merge
	await expect(page.locator('svg path[id^="edge-"]')).toHaveCount(16);
	// tag pills with pointer lines to their commits
	await expect(page.locator('svg line[id$="-tagline"]')).toHaveCount(2);
	await expect(page.locator("svg text", { hasText: "v1.0" })).toHaveCount(2);
});
