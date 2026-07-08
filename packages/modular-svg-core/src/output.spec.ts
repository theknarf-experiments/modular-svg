import { describe, expect, it } from "vitest";
import { layoutToSvg } from "./output.ts";
import type { LayoutResult, NodeRecord } from "./solver/index.ts";

describe("layoutToSvg", () => {
	it("creates an svg sized to fit all boxes", () => {
		const nodes: NodeRecord[] = [
			{ id: "A", x: 0, y: 0, width: 10, height: 20, type: "rect" },
			{ id: "B", x: 10, y: 20, width: 5, height: 5, type: "rect" },
		];
		const layout: LayoutResult = {
			A: { x: 0, y: 0, width: 10, height: 20 },
			B: { x: 10, y: 20, width: 5, height: 5 },
		};
		const svg = layoutToSvg(layout, nodes);
		expect(svg).toContain('width="15"');
		expect(svg).toContain('height="25"');
		expect(svg).toContain('<rect id="A"');
		expect(svg.startsWith("<svg")).toBe(true);
	});

	it("supports circle marks", () => {
		const nodes: NodeRecord[] = [
			{ id: "C", type: "circle", r: 5, x: 0, y: 0, width: 10, height: 10 },
		];
		const layout: LayoutResult = { C: { x: 2, y: 3, width: 10, height: 10 } };
		const svg = layoutToSvg(layout, nodes);
		// The layout is translated so its bounds start at the margin (0 here),
		// so the circle at (2,3) ends up centered at (5,5) in a 10x10 viewport.
		expect(svg).toContain('<circle id="C"');
		expect(svg).toContain('cx="5"');
		expect(svg).toContain('cy="5"');
	});

	it("applies fill and stroke and text", () => {
		const nodes: NodeRecord[] = [
			{
				id: "R",
				type: "rect",
				x: 0,
				y: 0,
				width: 10,
				height: 10,
				fill: "red",
				stroke: "blue",
				strokeWidth: 2,
			},
			{
				id: "T",
				type: "text",
				x: 5,
				y: 5,
				width: 16,
				height: 16,
				text: "hi",
				fill: "green",
			},
		];
		const layout: LayoutResult = {
			R: { x: 1, y: 2, width: 10, height: 10 },
			T: { x: 5, y: 5, width: 16, height: 16 },
		};
		const svg = layoutToSvg(layout, nodes);
		expect(svg).toContain('fill="red"');
		expect(svg).toContain('stroke="blue"');
		expect(svg).toContain('stroke-width="2"');
		expect(svg).toContain('<text id="T"');
		expect(svg).toContain(">hi<");
		expect(svg).toContain('font-family="sans-serif"');
		// text is filled, not stroked: no default black outline on glyphs
		const textTag = /<text id="T"[^>]*>/.exec(svg)?.[0] ?? "";
		expect(textTag).toContain('stroke="none"');
	});

	it("passes extra SVG attributes through", () => {
		const nodes: NodeRecord[] = [
			{
				id: "R",
				type: "rect",
				x: 0,
				y: 0,
				width: 10,
				height: 10,
				attrs: { rx: 10, "data-label": "a<b" },
			},
		];
		const layout: LayoutResult = { R: { x: 0, y: 0, width: 10, height: 10 } };
		const svg = layoutToSvg(layout, nodes);
		expect(svg).toContain('rx="10"');
		expect(svg).toContain('data-label="a&lt;b"');
	});

	it("translates path marks to their layout position", () => {
		const nodes: NodeRecord[] = [
			{ id: "O", type: "rect", x: 0, y: 0, width: 5, height: 5 },
			{
				id: "P",
				type: "path",
				d: "M 0,0 L 9,4.5 L 0,9 Z",
				dOrigin: { x: 0, y: 0 },
				x: 0,
				y: 0,
				width: 9,
				height: 9,
			},
		];
		const layout: LayoutResult = {
			O: { x: 0, y: 0, width: 5, height: 5 },
			P: { x: 91, y: 45.5, width: 9, height: 9 },
		};
		const svg = layoutToSvg(layout, nodes);
		expect(svg).toContain('transform="translate(91,45.5)"');
	});

	it("renders curves as smooth cubics between boxes", () => {
		const nodes: NodeRecord[] = [
			{ id: "A", x: 0, y: 0, width: 10, height: 10, type: "rect" },
			{ id: "B", x: 40, y: 30, width: 10, height: 10, type: "rect" },
			{
				id: "C",
				type: "curve",
				from: "A",
				to: "B",
				source: [1, 0.5],
				target: [0, 0.5],
				curveDirection: "horizontal",
				x: 0,
				y: 0,
				width: 0,
				height: 0,
			},
		];
		const layout: LayoutResult = {
			A: { x: 0, y: 0, width: 10, height: 10 },
			B: { x: 40, y: 30, width: 10, height: 10 },
			C: { x: 10, y: 5, width: 30, height: 30 },
		};
		const svg = layoutToSvg(layout, nodes);
		expect(svg).toContain('d="M 10,5 C 25,5 25,35 40,35"');
	});

	it("renders arrows", () => {
		const nodes: NodeRecord[] = [
			{ id: "A", x: 0, y: 0, width: 10, height: 10 },
			{ id: "B", x: 20, y: 0, width: 10, height: 10 },
			{
				id: "L",
				type: "arrow",
				from: "A",
				to: "B",
				x: 0,
				y: 0,
				width: 0,
				height: 0,
			},
		];
		const layout: LayoutResult = {
			A: { x: 0, y: 0, width: 10, height: 10 },
			B: { x: 20, y: 0, width: 10, height: 10 },
			L: { x: 0, y: 0, width: 0, height: 0 },
		};
		const svg = layoutToSvg(layout, nodes);
		expect(svg).toContain('<line id="L"');
		expect(svg).toContain("<polygon");
		expect(svg).not.toContain("marker-end");
		expect(svg).toContain('stroke-width="3"');
	});
});
