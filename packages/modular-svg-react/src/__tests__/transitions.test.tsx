import type { SvgDocument } from "@modular-svg/core";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Graphic } from "../Graphic";
import { diffTransitions, timingAttributes } from "../transitions";

const doc = (children: SvgDocument["children"]): SvgDocument => ({
	width: 100,
	height: 100,
	children,
});

describe("diffTransitions", () => {
	it("tweens changed geometry and color of elements present in both", () => {
		const before = doc([
			{ type: "circle", id: "a", cx: 10, cy: 10, r: 5, fill: "#f00" },
			{ type: "rect", id: "gone", x: 0, y: 0, width: 1, height: 1 },
		]);
		const after = doc([
			{ type: "circle", id: "a", cx: 40, cy: 10, r: 5, fill: "#00f" },
			{ type: "rect", id: "new", x: 0, y: 0, width: 1, height: 1 },
		]);
		const t = diffTransitions(before, after);
		expect([...t.keys()]).toEqual(["a"]);
		expect(t.get("a")).toEqual([
			{ attributeName: "cx", from: "10", to: "40", kind: "attribute" },
			{ attributeName: "fill", from: "#f00", to: "#00f", kind: "attribute" },
		]);
	});

	it("reshapes connectors, finds elements inside motion wrappers, and moves paths by transform", () => {
		const before = doc([
			{
				type: "g",
				children: [{ type: "line", id: "l", x1: 0, y1: 0, x2: 10, y2: 0 }],
			},
			{ type: "polygon", id: "l-head", points: "10,0 8,1 8,-1" },
			{ type: "path", id: "p", d: "M0 0 L1 1", transform: "translate(5,5)" },
		]);
		const after = doc([
			{
				type: "g",
				children: [{ type: "line", id: "l", x1: 0, y1: 0, x2: 20, y2: 5 }],
			},
			{ type: "polygon", id: "l-head", points: "20,5 18,6 18,4" },
			{ type: "path", id: "p", d: "M0 0 L2 2", transform: "translate(9,5)" },
		]);
		const t = diffTransitions(before, after);
		expect(t.get("l")?.map((x) => x.attributeName)).toEqual(["x2", "y2"]);
		expect(t.get("l-head")?.[0].attributeName).toBe("points");
		expect(t.get("p")).toEqual([
			{
				attributeName: "d",
				from: "M0 0 L1 1",
				to: "M0 0 L2 2",
				kind: "attribute",
			},
			{ attributeName: "transform", from: "5 5", to: "9 5", kind: "translate" },
		]);
	});

	it("skips path data whose commands differ, and starts from a live value mid-flight", () => {
		const t = diffTransitions(
			doc([
				{ type: "path", id: "p", d: "M0 0 L1 1" },
				{ type: "circle", id: "c", cx: 0, cy: 0, r: 1 },
			]),
			doc([
				{ type: "path", id: "p", d: "M0 0 L1 1 L2 0" },
				{ type: "circle", id: "c", cx: 50, cy: 0, r: 1 },
			]),
			(id, name) => (id === "c" && name === "cx" ? 20 : undefined),
		);
		expect(t.has("p")).toBe(false);
		expect(t.get("c")?.[0].from).toBe("20");
	});

	it("turns eases into SMIL timing", () => {
		expect(timingAttributes({ duration: 0.5, ease: "linear" })).toMatchObject({
			dur: "0.5s",
			calcMode: "linear",
		});
		expect(timingAttributes({ ease: "hold" }).calcMode).toBe("discrete");
		expect(timingAttributes({}).keySplines).toBe("0.23 1 0.32 1");
	});
});

describe("Graphic transition", () => {
	it("renders SMIL tweens on the elements a re-solve moved", async () => {
		const scene = (spacing: number) => (
			<Graphic transition={{ duration: 0.4 }}>
				<stackH spacing={spacing}>
					<circle key="a" r={5} />
					<circle key="b" r={5} />
				</stackH>
			</Graphic>
		);
		const { container, rerender } = render(scene(10));
		await waitFor(() =>
			expect(container.querySelector("circle#b")).toBeTruthy(),
		);
		expect(container.querySelector("[data-transition]")).toBeNull();
		rerender(scene(40));
		await waitFor(() =>
			expect(
				container.querySelector("circle#b [data-transition]"),
			).toBeTruthy(),
		);
		const tween = container.querySelector("circle#b animate");
		expect(tween?.getAttribute("attributeName")).toBe("cx");
		expect(tween?.getAttribute("begin")).toBe("indefinite");
		expect(tween?.getAttribute("dur")).toBe("0.4s");
	});
});
