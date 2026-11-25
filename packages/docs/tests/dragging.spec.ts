import { expect, type Page, test } from "@playwright/test";

// Dragology only reacts to real pointer events, so the drags are checked here

const centre = async (page: Page, selector: string) => {
	await page.locator(selector).first().scrollIntoViewIfNeeded();
	const b = await page.locator(selector).first().boundingBox();
	if (!b) throw new Error(`${selector} is not drawn`);
	return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

const drag = async (
	page: Page,
	selector: string,
	to: { x: number; y: number },
) => {
	const from = await centre(page, selector);
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	for (let i = 1; i <= 12; i++)
		await page.mouse.move(
			from.x + ((to.x - from.x) * i) / 12,
			from.y + ((to.y - from.y) * i) / 12,
		);
	await page.mouse.up();
	// Let the drop animation finish
	await page.waitForTimeout(600);
};

test.beforeEach(async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await page.goto("/dragging/");
	await page.locator("#word-the").waitFor();
	expect(errors).toEqual([]);
});

test("a chip dropped first starts the sentence", async ({ page }) => {
	const first = await centre(page, "#word-quick");
	await drag(page, "#word-the", { x: first.x - 30, y: first.y });
	const the = await centre(page, "#word-the");
	const quick = await centre(page, "#word-quick");
	expect(the.x).toBeLessThan(quick.x);
});

test("a card dropped on another column moves there", async ({ page }) => {
	const done = await centre(page, "#column-done");
	const before = (await page.locator("#column-done").boundingBox())?.height;
	await drag(page, "#drag-bug", { x: done.x, y: done.y + 30 });
	const after = (await page.locator("#column-done").boundingBox())?.height;
	expect(after).toBeGreaterThan(before ?? Number.POSITIVE_INFINITY);
	const bug = await centre(page, "#drag-bug");
	expect(Math.abs(bug.x - done.x)).toBeLessThan(40);
});

test("an arrow follows a dragged node", async ({ page }) => {
	const line = page.locator("#edge-idea-draft").first();
	const node = page.locator("#drag-idea");
	const [y1, at] = [
		await line.getAttribute("y1"),
		await node.getAttribute("transform"),
	];
	const idea = await centre(page, "#drag-idea");
	await drag(page, "#drag-idea", { x: idea.x, y: idea.y + 60 });
	expect(await node.getAttribute("transform")).not.toEqual(at);
	expect(await line.getAttribute("y1")).not.toEqual(y1);
});

test("dragging the last box turns the row into a column", async ({ page }) => {
	const handle = await centre(page, "#handle");
	const a = await centre(page, "#a");
	await drag(page, "#handle", { x: a.x, y: handle.y + 150 });
	const [after, column] = [
		await centre(page, "#handle"),
		await centre(page, "#a"),
	];
	expect(after.y - column.y).toBeGreaterThan(80);
	expect(Math.abs(after.x - column.x)).toBeLessThan(1);
});

test("the planet label goes where it is dropped", async ({ page }) => {
	const earth = await centre(page, "#drag-earth");
	await drag(page, "#drag-label", { x: earth.x, y: earth.y - 60 });
	const label = await centre(page, "#drag-label");
	expect(Math.abs(label.x - earth.x)).toBeLessThan(2);
	expect(label.y).toBeLessThan(earth.y);
	expect(await page.locator("#drag-label text").textContent()).toBe("Earth");
});

test("the arrow tracks the label mid-drag", async ({ page }) => {
	const label = await centre(page, "#drag-label");
	const arrow = page.locator("#arrow").first();
	await page.mouse.move(label.x, label.y);
	await page.mouse.down();
	const tails: number[] = [];
	for (let i = 1; i <= 6; i++) {
		await page.mouse.move(label.x + i * 25, label.y);
		tails.push(Number(await arrow.getAttribute("x1")));
	}
	await page.mouse.up();
	// the tail follows the pointer step by step, not one jump between planets
	const steps = tails.slice(1).map((x, i) => x - tails[i]);
	for (const step of steps) expect(step).toBeGreaterThan(10);
});

test("a planet dragged first leads the row, its label with it", async ({
	page,
}) => {
	const mercury = await centre(page, "#drag-mercury");
	await drag(page, "#drag-mars", { x: mercury.x - 30, y: mercury.y });
	const mars = await centre(page, "#drag-mars");
	expect(mars.x).toBeLessThan((await centre(page, "#drag-mercury")).x);
	// the label still names mercury
	const label = await centre(page, "#drag-label");
	expect(
		Math.abs(label.x - (await centre(page, "#drag-mercury")).x),
	).toBeLessThan(2);
});
