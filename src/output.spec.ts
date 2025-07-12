import { describe, expect, it } from "vitest";
import { layoutToSvg } from "./output";
import type { LayoutResult } from "./solver";

describe("layoutToSvg", () => {
	it("creates an svg sized to fit all boxes", () => {
		const layout: LayoutResult = {
			A: { x: 0, y: 0, width: 10, height: 20 },
			B: { x: 10, y: 20, width: 5, height: 5 },
		};
		const svg = layoutToSvg(layout);
		expect(svg).toContain('width="15"');
		expect(svg).toContain('height="25"');
		expect(svg).toContain('<rect id="A"');
		expect(svg.startsWith("<svg")).toBe(true);
	});
});
