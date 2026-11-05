import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	oklchToDisplayRgb,
	oklchToRgb,
	parseRgba,
	rgbaToHex,
	rgbToOklch,
} from "./color.ts";

const hexOf = (v: string) => {
	const c = parseRgba(v);
	return c && rgbaToHex(c.r, c.g, c.b, c.a);
};

describe("parsing CSS colors", () => {
	it("reads hex with and without alpha", () => {
		expect(hexOf("#abc")).toBe("#aabbcc");
		expect(hexOf("#abcd")).toBe("#aabbccdd");
		expect(hexOf("#11223380")).toBe("#11223380");
	});

	it("reads rgb() and hsl() in comma and space syntax, with alpha", () => {
		expect(hexOf("rgb(255, 0, 0)")).toBe("#ff0000");
		expect(hexOf("rgb(100% 50% 0% / 50%)")).toBe("#ff800080");
		expect(hexOf("rgba(10,20,30,0.5)")).toBe("#0a141e80");
		expect(hexOf("hsl(120, 100%, 50%)")).toBe("#00ff00");
		expect(hexOf("hsl(0.5turn 100% 50%)")).toBe("#00ffff");
		expect(hexOf("hsla(240deg 100% 50% / 0.25)")).toBe("#0000ff40");
	});

	it("reads oklch(), named colors and transparent", () => {
		expect(hexOf("oklch(0.627955 0.257683 29.2339)")).toBe("#ff0000");
		expect(hexOf("oklch(62.8% 0.2577 29.23)")).toBe("#ff0000");
		expect(hexOf("teal")).toBe("#008080");
		expect(hexOf("RebeccaPurple")).toBe("#663399");
		expect(hexOf("transparent")).toBe("#00000000");
	});

	it("leaves what it cannot read alone", () => {
		for (const v of [
			"none",
			"currentColor",
			"url(#g)",
			"nosuchcolor",
			"rgb(1, 2)",
			"#12345",
		])
			expect(parseRgba(v)).toBeUndefined();
	});
});

const channel = fc.integer({ min: 0, max: 255 }).map((v) => v / 255);

describe("OKLCH (properties)", () => {
	it("round-trips every 8-bit sRGB color", () => {
		fc.assert(
			fc.property(channel, channel, channel, (r, g, b) => {
				const [L, C, h] = rgbToOklch(r, g, b);
				const back = oklchToRgb(L, C, h);
				for (const [x, y] of [
					[back[0], r],
					[back[1], g],
					[back[2], b],
				])
					expect(Math.abs(x - y)).toBeLessThan(1e-4);
			}),
		);
	});

	it("maps any lightness, chroma and hue to displayable sRGB at that lightness", () => {
		fc.assert(
			fc.property(
				fc.double({ min: 0, max: 1, noNaN: true }),
				fc.double({ min: 0, max: 0.4, noNaN: true }),
				fc.double({ min: 0, max: 360, noNaN: true }),
				(L, C, h) => {
					const rgb = oklchToDisplayRgb(L, C, h);
					for (const c of rgb) {
						expect(c).toBeGreaterThanOrEqual(0);
						expect(c).toBeLessThanOrEqual(1);
					}
					// gamut mapping trades chroma, never lightness
					expect(rgbToOklch(...rgb)[0]).toBeCloseTo(L, 2);
				},
			),
		);
	});
});
