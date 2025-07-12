import { describe, expect, it } from "vitest";
import { layoutToSvg } from "./output";
import type { LayoutResult, NodeRecord } from "./solver";

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
		expect(svg).toContain('<circle id="C"');
		expect(svg).toContain('cx="7"');
		expect(svg).toContain('cy="8"');
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
