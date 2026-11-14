import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

// Graphic's transition tweens run on the SVG's SMIL clock, which it also
// lines up with the scene's CSS animations. Neither may spoil the other.

const fixture = fileURLToPath(
	new URL("./fixtures/clocks.tsx", import.meta.url),
);

const mount = async (page: Page, mode: string) => {
	await page.goto("http://localhost:5173/");
	await page.addScriptTag({ type: "module", url: `/@fs${fixture}` });
	await page.waitForFunction(() => "mount" in window);
	await page.evaluate(
		(m) => (window as never as { mount: (m: string) => void }).mount(m),
		mode,
	);
	await page.waitForSelector("#clocks #b");
};

/** Where b is drawn, in the svg's own pixels, `after` ms from now. */
const leftOfB = (page: Page, after = 0) =>
	page.evaluate(async (wait) => {
		await new Promise((r) => setTimeout(r, wait));
		const svg = document.querySelector("#clocks svg") as SVGSVGElement;
		const b = svg.querySelector("#b") as SVGRectElement;
		return b.getBoundingClientRect().x - svg.getBoundingClientRect().x;
	}, after);

/** The SMIL clock and the scene's CSS clock, in seconds. */
const clocks = (page: Page) =>
	page.evaluate(() => {
		const svg = document.querySelector("#clocks svg") as SVGSVGElement;
		const scene = svg
			.getAnimations({ subtree: true })
			.find((a) => "animationName" in a);
		return {
			smil: svg.getCurrentTime(),
			css: Number(scene?.currentTime) / 1000,
		};
	});

const change = (page: Page) =>
	page.evaluate(() => (window as never as { change: () => void }).change());

for (const mode of ["first-motion", "page-transition"])
	test(`a state change tweens and leaves the clocks in step (${mode})`, async ({
		page,
	}) => {
		await mount(page, mode);
		// long enough for SMIL to be well past a CSS clock that starts later
		await page.waitForTimeout(1500);
		expect(await leftOfB(page)).toBeCloseTo(60, 0);
		await change(page);
		const early = await leftOfB(page, 150);
		expect(early).toBeGreaterThan(40);
		expect(early).toBeLessThan(58);
		const late = await leftOfB(page, 250);
		expect(late).toBeLessThan(early - 5);
		expect(late).toBeGreaterThan(31);
		// once the tween is over it rests, and nothing plays it again
		for (const wait of [400, 500, 500, 500, 500])
			expect(await leftOfB(page, wait)).toBeCloseTo(30, 0);
		const { smil, css } = await clocks(page);
		expect(Math.abs(smil - css)).toBeLessThan(0.05);
	});
