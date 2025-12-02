import { expect, test } from "@playwright/test";

test("Context forwarding works - theme changes update circle colors", async ({
	page,
}) => {
	await page.goto("http://localhost:5173");

	// Wait for the context canvas to be visible
	const canvas = page.locator('[data-testid="context-canvas"]');
	await expect(canvas).toBeVisible();

	// Find circles inside the context canvas - use nth to target specific canvas
	// (there are multiple canvases on the page)
	const circles = canvas.locator("circle");
	await expect(circles).toHaveCount(3);

	// Check initial theme is "light" - blue colors (#3b82f6)
	const firstCircle = circles.first();
	await expect(firstCircle).toHaveAttribute("fill", "#3b82f6");
	await expect(firstCircle).toHaveAttribute("stroke", "#1e40af");

	// Find the theme dropdown - it's the select element near "Theme Context"
	const themeSelect = page
		.getByText("Theme Context:")
		.locator("..")
		.locator("select");

	// Change to dark theme
	await themeSelect.selectOption("dark");

	// Wait for React to update
	await page.waitForTimeout(200);

	// Check theme changed to "dark" - dark colors (#1e293b)
	await expect(firstCircle).toHaveAttribute("fill", "#1e293b");
	await expect(firstCircle).toHaveAttribute("stroke", "#475569");

	// Verify all three circles updated
	for (let i = 0; i < 3; i++) {
		const circle = circles.nth(i);
		await expect(circle).toHaveAttribute("fill", "#1e293b");
		await expect(circle).toHaveAttribute("stroke", "#475569");
	}
});

test("Context forwarding works - size scale changes circle radius", async ({
	page,
}) => {
	await page.goto("http://localhost:5173");

	// Wait for the context canvas
	const canvas = page.locator('[data-testid="context-canvas"]');
	await expect(canvas).toBeVisible();

	const circles = canvas.locator("circle");
	const firstCircle = circles.first();

	// Check initial radius (scale = 1.0, base = 20)
	await expect(firstCircle).toHaveAttribute("r", "20");

	// Find the scale slider - it's near the "Size Scale Context" text
	const scaleSlider = page
		.getByText("Size Scale Context:")
		.locator("..")
		.locator('input[type="range"]');

	// Change scale to 2.0
	await scaleSlider.fill("2");

	// Wait for React to update
	await page.waitForTimeout(200);

	// Check radius doubled (20 * 2.0 = 40)
	await expect(firstCircle).toHaveAttribute("r", "40");

	// Change scale to 0.5
	await scaleSlider.fill("0.5");
	await page.waitForTimeout(200);

	// Check radius halved (20 * 0.5 = 10)
	await expect(firstCircle).toHaveAttribute("r", "10");

	// Verify all three circles have the same radius
	for (let i = 0; i < 3; i++) {
		const circle = circles.nth(i);
		await expect(circle).toHaveAttribute("r", "10");
	}
});

test("Context forwarding works - multiple contexts update independently", async ({
	page,
}) => {
	await page.goto("http://localhost:5173");

	const canvas = page.locator('[data-testid="context-canvas"]');
	await expect(canvas).toBeVisible();

	const circles = canvas.locator("circle");
	const firstCircle = circles.first();

	// Initial state: light theme (#3b82f6), scale 1.0
	await expect(firstCircle).toHaveAttribute("fill", "#3b82f6");
	await expect(firstCircle).toHaveAttribute("r", "20");

	// Change theme to dark
	const themeSelect = page
		.getByText("Theme Context:")
		.locator("..")
		.locator("select");
	await themeSelect.selectOption("dark");
	await page.waitForTimeout(200);

	// Theme changed, radius unchanged
	await expect(firstCircle).toHaveAttribute("fill", "#1e293b");
	await expect(firstCircle).toHaveAttribute("r", "20");

	// Change scale to 1.5
	const scaleSlider = page
		.getByText("Size Scale Context:")
		.locator("..")
		.locator('input[type="range"]');
	await scaleSlider.fill("1.5");
	await page.waitForTimeout(200);

	// Both contexts updated correctly
	await expect(firstCircle).toHaveAttribute("fill", "#1e293b");
	await expect(firstCircle).toHaveAttribute("r", "30"); // 20 * 1.5

	// Change back to light theme
	await themeSelect.selectOption("light");
	await page.waitForTimeout(200);

	// Theme changed back, radius still scaled
	await expect(firstCircle).toHaveAttribute("fill", "#3b82f6");
	await expect(firstCircle).toHaveAttribute("r", "30");
});
