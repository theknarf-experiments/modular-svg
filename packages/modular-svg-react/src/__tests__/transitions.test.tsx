import type { SvgDocument } from "@modular-svg/core";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Graphic } from "../Graphic";
import {
	diffTransitions,
	exiting,
	type Transition,
	tweenAttributes,
} from "../transitions";

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
		expect([...t.keys()]).toEqual(["a", "new"]);
		expect(t.get("new")).toEqual([
			{ attributeName: "opacity", from: "0", to: "1", kind: "attribute" },
		]);
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
		const cx: Transition = {
			attributeName: "cx",
			from: "10",
			to: "40",
			kind: "attribute",
		};
		expect(tweenAttributes(cx, { duration: 0.5, ease: "linear" })).toEqual({
			dur: "0.5s",
			begin: "indefinite",
			fill: "freeze",
			values: "10;40",
			keyTimes: "0;1",
			calcMode: "linear",
		});
		expect(tweenAttributes(cx, { ease: "hold" }).calcMode).toBe("discrete");
		expect(tweenAttributes(cx, {}).keySplines).toBe("0.23 1 0.32 1");
	});

	it("spells a spring out as values, since a keySpline cannot overshoot", () => {
		const tween = (attributeName: string, from: string, to: string) =>
			tweenAttributes(
				{ attributeName, from, to, kind: "attribute" },
				{ ease: "spring" },
			);
		const cx = tween("cx", "10", "40");
		const values = cx.values.split(";").map(Number);
		expect(cx.calcMode).toBe("linear");
		expect(cx.keySplines).toBeUndefined();
		expect(values.length).toBeGreaterThan(8);
		expect(cx.keyTimes.split(";")).toHaveLength(values.length);
		expect(values[0]).toBe(10);
		expect(values.at(-1)).toBe(40);
		expect(Math.max(...values)).toBeGreaterThan(42);

		// What the attribute cannot show is cut off
		const fade = tween("opacity", "0", "1").values.split(";").map(Number);
		expect(Math.max(...fade)).toBe(1);
		const shrink = tween("r", "20", "0").values.split(";").map(Number);
		expect(Math.min(...shrink)).toBe(0);

		// Path data and a translate mix number by number
		expect(tween("d", "M 0,0 L 10,0", "M 0,0 L 50,0").values).toMatch(
			/^M 0,0 L 10,0;.*;M 0,0 L 50,0$/,
		);
		expect(
			tweenAttributes(
				{
					attributeName: "transform",
					from: "0 0",
					to: "30 0",
					kind: "translate",
				},
				{ ease: "bounce" },
			).values.split(";").length,
		).toBeGreaterThan(8);

		// Colors do not spring
		expect(tween("fill", "#f00", "#00f")).toMatchObject({
			values: "#f00;#00f",
			calcMode: "spline",
			keySplines: "0.23 1 0.32 1",
		});
	});

	it("no longer hands SMIL a pop keySpline it would drop", () => {
		const pop = tweenAttributes(
			{ attributeName: "x", from: "0", to: "100", kind: "attribute" },
			{ ease: "pop" },
		);
		expect(pop.keySplines).toBeUndefined();
		expect(Math.max(...pop.values.split(";").map(Number))).toBeGreaterThan(105);
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

describe("reduced motion", () => {
	it("skips transitions when the viewer prefers reduced motion", async () => {
		const original = globalThis.matchMedia;
		globalThis.matchMedia = ((query: string) => ({
			matches: query.includes("reduce"),
		})) as typeof matchMedia;
		try {
			const scene = (spacing: number) => (
				<Graphic transition>
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
			const before = container.querySelector("circle#b")?.getAttribute("cx");
			rerender(scene(40));
			await waitFor(() =>
				expect(
					container.querySelector("circle#b")?.getAttribute("cx"),
				).not.toBe(before),
			);
			expect(container.querySelector("[data-transition]")).toBeNull();
		} finally {
			globalThis.matchMedia = original;
		}
	});
});

describe("paths the timeline redraws", () => {
	const smil = {
		attributeName: "d",
		values: "M0 0 L1 1;M0 0 L5 5",
		keyTimes: "0;1",
		dur: "1s",
		repeatCount: "1",
	};
	const wire = (d: string, animate?: (typeof smil)[]) =>
		doc([{ type: "path", id: "wire", d, stroke: "black", animate }]);

	it("leaves d alone on a path that carries its own animation", () => {
		expect(
			diffTransitions(wire("M0 0 L1 1"), wire("M0 0 L2 2", [smil])).has("wire"),
		).toBe(false);
		expect(
			diffTransitions(wire("M0 0 L1 1"), wire("M0 0 L2 2")).get("wire"),
		).toMatchObject([{ attributeName: "d" }]);
	});
});

describe("appearing and leaving", () => {
	const before = doc([
		{ type: "circle", id: "stay", cx: 0, cy: 0, r: 1 },
		{ type: "path", id: "gone", d: "M0 0 L1 1", animate: [] },
	]);
	const after = doc([
		{ type: "circle", id: "stay", cx: 0, cy: 0, r: 1 },
		{
			type: "rect",
			id: "fresh",
			x: 0,
			y: 0,
			width: 1,
			height: 1,
			attrs: { opacity: 0.5 },
		},
	]);

	it("fades new marks up to their own opacity, unless fading is off", () => {
		expect(diffTransitions(before, after).get("fresh")?.[0]).toMatchObject({
			from: "0",
			to: "0.5",
		});
		expect(
			diffTransitions(before, after, undefined, { fade: false }).has("fresh"),
		).toBe(false);
	});

	it("keeps removed marks around, without their own SMIL, to fade out", () => {
		const { elements, fades } = exiting(before, after);
		expect(elements.map((e) => e.id)).toEqual(["gone"]);
		expect(elements[0].type === "path" && elements[0].animate).toBeUndefined();
		expect(fades.get("gone")?.[0]).toMatchObject({
			attributeName: "opacity",
			to: "0",
		});
	});
});

describe("Graphic leaving marks", () => {
	it("renders a removed mark until its fade ends", async () => {
		const scene = (both: boolean) => (
			<Graphic transition={{ duration: 0.1 }}>
				<stackH>
					<circle key="a" r={5} />
					{both && <circle key="b" r={5} />}
				</stackH>
			</Graphic>
		);
		const { container, rerender } = render(scene(true));
		await waitFor(() =>
			expect(container.querySelector("circle#b")).toBeTruthy(),
		);
		rerender(scene(false));
		await waitFor(() =>
			expect(
				container
					.querySelector("circle#b animate")
					?.getAttribute("attributeName"),
			).toBe("opacity"),
		);
		await waitFor(
			() => expect(container.querySelector("circle#b")).toBeNull(),
			{ timeout: 1000 },
		);
	});
});
