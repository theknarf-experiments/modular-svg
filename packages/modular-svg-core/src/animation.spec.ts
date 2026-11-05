import { describe, expect, it } from "vitest";
import type { AnimationOptions } from "./animation.ts";
import { serializeToSvg } from "./output.ts";
import { buildSceneFromJson } from "./parser.ts";
import { solveLayout } from "./solver/index.ts";
import { layoutToAst } from "./svg_ast.ts";

type N = {
	type: string;
	id?: string;
	props?: Record<string, unknown>;
	children?: N[];
	target?: string;
};
const ref = (target: string): N => ({ type: "Ref", target });
const on = (
	type: string,
	id: string,
	target: string,
	props: Record<string, unknown> = {},
): N => ({ type, id, props, children: [ref(target)] });

const render = (children: N[], animation?: AnimationOptions) => {
	const scene = buildSceneFromJson({ type: "Group", id: "root", children });
	const ast = layoutToAst(solveLayout(scene), scene.nodes, 0, { animation });
	return { ast, svg: serializeToSvg(ast) };
};
const box = (id: string, props: Record<string, unknown> = {}): N => ({
	type: "Rect",
	id,
	props: { width: 20, height: 20, fill: "#fff", ...props },
});

describe("animated SVG output", () => {
	it("leaves static scenes untouched", () => {
		const { ast, svg } = render([box("a")]);
		expect(ast.css).toBeUndefined();
		expect(svg).not.toContain("<style>");
	});

	it("wraps a mark in a shell group whose keyframes follow the solved span", () => {
		const { ast, svg } = render([
			box("a"),
			box("b"),
			on("Enter", "aIn", "a", { over: 1 }),
			on("Enter", "bIn", "b", { over: 1 }),
			{ type: "Sequence", children: [ref("aIn"), ref("bIn")] },
		]);
		expect(ast.duration).toBe(2);
		expect(ast.children.map((c) => c.type)).toEqual(["g", "g"]);
		// b: hidden until 50%, faded in by 100%
		expect(ast.css).toMatch(
			/0%\{opacity:0\}50%\{opacity:0;animation-timing-function:cubic-bezier\(0\.23,1,0\.32,1\)\}100%\{opacity:1\}/,
		);
		expect(ast.css).toContain("animation-duration:2s");
		expect(ast.css).toContain("prefers-reduced-motion");
		expect(svg).toMatch(/<g class="ms\w+-a ms\w+-c\d"><rect id="b"/);
	});

	it("stacks motions on one mark as nested shells, outermost first", () => {
		const { ast } = render([
			box("a"),
			on("Enter", "in", "a", { over: 1 }),
			on("Exit", "out", "a", { over: 1 }),
			{
				type: "Sequence",
				props: { gap: 1 },
				children: [ref("in"), ref("out")],
			},
		]);
		const outer = ast.children[0];
		expect(outer.type).toBe("g");
		expect(outer.type === "g" && outer.children[0].type).toBe("g");
	});

	it("pivots scale and rotate on the target's center", () => {
		const { ast } = render([
			box("a", { x: 10, y: 10 }),
			on("Enter", "in", "a", { from: { scale: 0 } }),
		]);
		expect(ast.css).toContain(
			"transform-box:view-box;transform-origin:11.5px 11.5px",
		);
	});

	it("draws strokes with a dash on the element itself", () => {
		const { svg, ast } = render([
			{ type: "StackH", children: [box("a"), box("b")] },
			{ type: "Arrow", id: "arr", children: [ref("a"), ref("b")] },
			on("Draw", "d", "arr", { over: 1 }),
		]);
		expect(svg).toMatch(
			/<line id="arr"[^>]*pathLength="1" stroke-dasharray="1" class="ms\w+-a/,
		);
		expect(ast.css).toContain("stroke-dashoffset:1;visibility:hidden");
	});

	it("animates colors with Motion steps, merging separate motions on one lane", () => {
		const { ast } = render([
			box("a"),
			on("Motion", "warm", "a", { steps: [{ to: { fill: "#f00" }, over: 1 }] }),
			on("Motion", "cool", "a", { steps: [{ to: { fill: "#00f" }, over: 1 }] }),
			{ type: "Sequence", children: [ref("warm"), ref("cool")] },
		]);
		expect(ast.css).toMatch(
			/0%\{fill:#fff[^}]*\}50%\{fill:#f00[^}]*\}100%\{fill:#00f\}/,
		);
	});

	it("refuses two motions moving one replaced lane at once", () => {
		expect(() =>
			render([
				box("a"),
				on("Motion", "m1", "a", { steps: [{ to: { fill: "#f00" }, over: 1 }] }),
				on("Motion", "m2", "a", { steps: [{ to: { fill: "#00f" }, over: 1 }] }),
			]),
		).toThrow(/m1 and m2 both move fill on a/);
	});

	it("morphs path data through SMIL and rejects mismatched commands", () => {
		const path = (d: string) => ({ type: "Path", id: "p", props: { d } });
		const { svg } = render([
			path("M0 0 L10 0 L10 10"),
			on("Motion", "m", "p", {
				steps: [{ to: { d: "M0 0 L10 10 L0 10" }, over: 1 }],
			}),
		]);
		expect(svg).toMatch(
			/<path id="p"[^>]*><animate attributeName="d" values="M0 0 L10 0 L10 10;M0 0 L10 10 L0 10"/,
		);
		expect(() =>
			render([
				path("M0 0 L10 0"),
				on("Motion", "m", "p", {
					steps: [{ to: { d: "M0 0 L10 0 L5 5" }, over: 1 }],
				}),
			]),
		).toThrow(/different commands/);
	});

	it("checks the channel against the mark", () => {
		expect(() =>
			render([
				{ type: "Text", id: "t", props: { text: "hi" } },
				on("Draw", "d", "t"),
			]),
		).toThrow(/text \(t\) cannot animate draw/);
	});

	it("animates every mark under a container target", () => {
		const { ast } = render([
			{ type: "StackH", id: "row", children: [box("a"), box("b")] },
			on("Enter", "in", "row", { from: { y: 10, opacity: 0 } }),
		]);
		expect(ast.children.every((c) => c.type === "g")).toBe(true);
		expect(ast.css).toContain("translate:0px 10px");
	});

	it("loops and names classes by content", () => {
		const a = render([box("a"), on("Wiggle", "w", "a", { seed: 1 })], {
			loop: true,
		});
		const b = render([box("a"), on("Wiggle", "w", "a", { seed: 2 })], {
			loop: true,
		});
		expect(a.ast.css).toContain("animation-iteration-count:infinite");
		expect(a.ast.css?.slice(0, 12)).not.toEqual(b.ast.css?.slice(0, 12));
		expect(
			render([box("a"), on("Wiggle", "w", "a", { seed: 1 })], { loop: true })
				.svg,
		).toEqual(a.svg);
	});

	it("holds layout bounds to marks, not time-only nodes", () => {
		const { ast } = render([
			box("a", { x: 100, y: 100 }),
			on("Enter", "in", "a"),
			{ type: "Beat", id: "beat" },
		]);
		expect([ast.width, ast.height]).toEqual([23, 23]);
	});
});

describe("Travel", () => {
	it("moves the mover through ref'd waypoints at even speed", () => {
		const { ast } = render([
			{
				type: "StackH",
				props: { spacing: 80 },
				children: [box("a"), box("b"), box("c")],
			},
			{ type: "Circle", id: "dot", props: { r: 3 } },
			{
				type: "Align",
				props: { alignment: "center" },
				children: [ref("a"), ref("dot")],
			},
			{
				type: "Travel",
				id: "trip",
				props: { over: 2 },
				children: [ref("dot"), ref("b"), ref("c")],
			},
		]);
		// two equal legs of 100px: halfway at b, the end at c
		expect(ast.css).toMatch(
			/0%\{translate:0px 0px[^}]*\}50%\{translate:100px 0px[^}]*\}100%\{translate:200px 0px\}/,
		);
	});
});
