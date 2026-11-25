import type * as React from "react";
import { describe, expect, it } from "vitest";
import { type SvgReactElement, svgElement } from "../svgElement";

const rect = {
	type: "rect" as const,
	id: "r",
	x: 10,
	y: 20,
	width: 30,
	height: 40,
	fill: "red",
	attrs: { rx: 4, "stroke-dasharray": "2 2", class: "box" },
};

describe("svgElement", () => {
	it("positions by attributes by default", () => {
		expect(svgElement(rect).props).toMatchObject({
			id: "r",
			x: 10,
			y: 20,
			width: 30,
			fill: "red",
			rx: 4,
			strokeDasharray: "2 2",
			className: "box",
		});
	});

	it("positions by transform, relative to an origin", () => {
		const { props } = svgElement(rect, {
			position: "transform",
			origin: { x: 10, y: 5 },
		});
		expect(props).toMatchObject({ transform: "translate(0, 15)" });
		expect(props).not.toHaveProperty("x");
	});

	it("moves circles and text by their anchor points", () => {
		const circle = { type: "circle" as const, cx: 5, cy: 6, r: 2 };
		const text = { type: "text" as const, id: "t", x: 1, y: 2, text: "hi" };
		const opts = { position: "transform" as const, origin: { x: 1, y: 1 } };
		expect(svgElement(circle, opts).props.transform).toBe("translate(4, 5)");
		expect(svgElement(text, opts).props).toMatchObject({
			transform: "translate(0, 1)",
			children: ["hi", undefined],
		});
	});

	it("shifts lines by their endpoints and paths by a translate", () => {
		const origin = { x: 1, y: 2 };
		const line = { type: "line" as const, id: "l", x1: 1, y1: 2, x2: 3, y2: 4 };
		expect(svgElement(line, { origin }).props).toMatchObject({
			x1: 0,
			y1: 0,
			x2: 2,
			y2: 2,
		});
		const path = { type: "path" as const, d: "M0 0", transform: "scale(2)" };
		expect(svgElement(path, { origin }).props.transform).toBe(
			"translate(-1, -2) scale(2)",
		);
		expect(svgElement(path).props.transform).toBe("scale(2)");
	});

	it("leaves ids off when asked", () => {
		expect(svgElement(rect, { ids: false }).props.id).toBeUndefined();
	});

	it("adds props and children per element", () => {
		const onClick = () => {};
		const el = svgElement(rect, {
			props: () => ({ onClick }),
			children: (e) => <title>{e.id}</title>,
		});
		expect(el.props.onClick).toBe(onClick);
		const title = el.props.children as React.ReactElement<{ children: string }>;
		expect(title.props.children).toBe("r");
	});

	it("renders a group's children with the same options", () => {
		const g = { type: "g" as const, id: "g", children: [rect, rect] };
		const el = svgElement(g, { ids: false, position: "transform" });
		const [child] = el.props.children as SvgReactElement[];
		expect(child.props).toMatchObject({ transform: "translate(10, 20)" });
		expect(child.props.id).toBeUndefined();
	});
});
