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

describe("scene length", () => {
	it("runs to the end of a trailing hold", () => {
		const { ast } = render([
			box("a"),
			on("Enter", "in", "a", { over: 1 }),
			{
				type: "Fermata",
				id: "held",
				props: { hold: 2 },
				children: [ref("in")],
			},
		]);
		expect(ast.duration).toBe(3);
	});
});

describe("animating colors", () => {
	it("animates to another node's solved color", () => {
		const { ast } = render([
			{
				type: "StackH",
				children: [
					box("a", { fill: undefined }),
					box("b", { fill: undefined }),
					box("cursor"),
				],
			},
			{ type: "DistinctColors", children: [ref("a"), ref("b")] },
			on("Motion", "m", "cursor", {
				steps: [
					{ to: { fill: { ref: "a" } }, over: 1 },
					{ to: { fill: { ref: "b" } }, over: 1 },
				],
			}),
		]);
		const fills = [...(ast.css ?? "").matchAll(/fill:(#[0-9a-f]+)/g)].map(
			(m) => m[1],
		);
		const solved = (id: string) => {
			const el = ast.children.find((c) => c.type === "rect" && c.id === id);
			return el && el.type === "rect" ? el.fill : undefined;
		};
		// starts at its own fill, then each swatch's solved hue
		expect(fills[0]).toBe("#fff");
		expect(fills).toContain(solved("a"));
		expect(fills.at(-1)).toBe(solved("b"));
	});

	it("starts a connector's stroke from its solved color", () => {
		const { ast } = render([
			{ type: "StackH", children: [box("a"), box("b")] },
			{ type: "Line", id: "l", children: [ref("a"), ref("b")] },
			{ type: "SameColor", children: [ref("a"), ref("l")] },
			on("Motion", "m", "l", {
				steps: [{ to: { stroke: "#ff0000" }, over: 1 }],
			}),
		]);
		expect(ast.css).toMatch(/0%\{stroke:#ffffff/);
	});

	it("names the ref when it has no color", () => {
		expect(() =>
			render([
				box("a"),
				{ type: "Group", id: "g" },
				on("Motion", "m", "a", {
					steps: [{ to: { fill: { ref: "g" } }, over: 1 }],
				}),
			]),
		).toThrow(/g has no color to take/);
	});
});

describe("reduced motion", () => {
	const morph = (animation?: AnimationOptions) =>
		render(
			[
				{ type: "Path", id: "p", props: { d: "M0 0 L10 0 L10 10" } },
				on("Motion", "m", "p", {
					steps: [{ to: { d: "M0 0 L10 10 L0 10" }, over: 1 }],
				}),
			],
			animation,
		);

	it("pairs a morphing path with a still copy that reduced motion shows instead", () => {
		const { svg, ast } = morph();
		const paths = [
			...svg.matchAll(/<path id="([^"]+)" d="([^"]+)"[^>]*class="([^"]+)"/g),
		];
		expect(paths.map((p) => p[1])).toEqual(["p", "p-still"]);
		// non-looping scenes hold their last frame
		expect(paths[1][2]).toBe("M0 0 L10 10 L0 10");
		expect(paths[0][3]).toMatch(/-dm$/);
		expect(paths[1][3]).toMatch(/-ds$/);
		expect(svg).not.toMatch(/p-still"[^>]*>.*<animate/);
		expect(ast.css).toMatch(/\.ms\w+-ds\{display:none\}/);
		expect(ast.css).toMatch(
			/prefers-reduced-motion:reduce\)\{.*\.ms\w+-dm\{display:none\}\.ms\w+-ds\{display:inline\}/,
		);
	});

	it("uses the chosen still frame, or none at all", () => {
		const half = morph({ stillAt: 0 });
		expect(half.svg).toMatch(/id="p-still" d="M0 0 L10 0 L10 10"/);
		expect(morph({ stillAt: false }).svg).not.toContain("p-still");
	});
});

describe("Phrase", () => {
	const phrase = (
		props: Record<string, unknown>,
		children: N[],
		id = "p",
	): N => ({ type: "Phrase", id, props, children });
	const keyframesOf = (css: string | undefined) =>
		[...(css ?? "").matchAll(/@keyframes [^{]+\{(.*)\}\n/g)].map((m) => m[1]);

	it("plays an Enter backwards as the Exit it mirrors", () => {
		const fade = { over: 1, ease: "linear" };
		const back = render([
			box("a"),
			phrase({ retrograde: true }, [
				on("Enter", "in", "a", { ...fade, from: { opacity: 0, y: 8 } }),
			]),
		]);
		const exit = render([
			box("a"),
			on("Exit", "out", "a", { ...fade, to: { opacity: 0, y: 8 } }),
		]);
		expect(back.ast.css).toBe(exit.ast.css);
		expect(back.svg).toBe(exit.svg);
	});

	it("reverses the ease with the motion", () => {
		const { ast } = render([
			box("a"),
			phrase({ retrograde: true }, [
				on("Enter", "in", "a", { over: 1, ease: "in" }),
			]),
		]);
		expect(ast.css).toContain(
			"0%{opacity:1;animation-timing-function:cubic-bezier(0.32,0.81,0.45,0.94)}100%{opacity:0}",
		);
	});

	it("turns a ping-pong around without a cut", () => {
		const { ast } = render([
			box("a"),
			phrase({ repeat: 2, alternate: true }, [
				on("Motion", "rise", "a", {
					steps: [{ to: { y: -20 }, over: 1, ease: "linear" }],
				}),
			]),
		]);
		expect(ast.duration).toBe(2);
		expect(keyframesOf(ast.css)).toEqual([
			"0%{translate:0px 0px;animation-timing-function:linear}50%{translate:0px -20px;animation-timing-function:linear}100%{translate:0px 0px}",
		]);
	});

	it("cuts back between passes that run the same way", () => {
		const { ast } = render([
			box("a"),
			phrase({ repeat: 2 }, [
				on("Motion", "rise", "a", {
					steps: [{ to: { y: -20 }, over: 1, ease: "linear" }],
				}),
			]),
		]);
		expect(keyframesOf(ast.css)[0]).toMatch(
			/^0%\{translate:0px 0px;[^}]+\}50%\{translate:0px -20px;animation-timing-function:steps\(1\)\}50\.001%\{translate:0px 0px;/,
		);
	});

	it("halves every keyframe time at rate 2", () => {
		const scene = (wrap: (n: N[]) => N[]) =>
			render(
				[
					box("a"),
					box("b"),
					...wrap([
						on("Enter", "aIn", "a", { over: 1 }),
						on("Enter", "bIn", "b", { over: 1 }),
						{ type: "Sequence", children: [ref("aIn"), ref("bIn")] },
					]),
				],
				{ duration: 4 },
			);
		const plain = scene((n) => n);
		const fast = scene((n) => [phrase({ rate: 2 }, n)]);
		const times = (css: string | undefined) =>
			keyframesOf(css).map((k) =>
				[...k.matchAll(/([\d.]+)%\{/g)].map((m) => Number(m[1])),
			);
		// b: fades in over 25%..50% of four seconds, or 12.5%..25% at double speed
		expect(times(plain.ast.css)[1]).toEqual([0, 25, 50, 100]);
		expect(times(fast.ast.css)[1]).toEqual([0, 12.5, 25, 100]);
	});

	it("nests: the inner phrase's passes play inside each outer pass", () => {
		const { ast } = render([
			box("a"),
			phrase(
				{ repeat: 2 },
				[
					phrase(
						{ repeat: 2, alternate: true },
						[
							on("Motion", "rise", "a", {
								steps: [{ to: { y: -20 }, over: 1, ease: "linear" }],
							}),
						],
						"inner",
					),
				],
				"outer",
			),
		]);
		expect(ast.duration).toBe(4);
		const at = [
			...keyframesOf(ast.css)[0].matchAll(
				/([\d.]+)%\{translate:0px (-?\d+)px/g,
			),
		];
		expect(at.map((m) => [Math.round(Number(m[1])), Number(m[2])])).toEqual([
			[0, 0],
			[25, -20],
			[50, 0],
			// the outer phrase's cut back to the start, which is where it already is
			[50, 0],
			[75, -20],
			[100, 0],
		]);
	});

	it("jumps first when a stepped ease runs backwards", () => {
		const { ast } = render([
			box("a"),
			phrase({ retrograde: true }, [
				on("Motion", "tick", "a", {
					steps: [{ to: { x: 30 }, over: 1, ease: "steps(3)" }],
				}),
			]),
		]);
		expect(ast.css).toContain(
			"0%{translate:30px 0px;animation-timing-function:steps(3,start)}100%{translate:0px 0px}",
		);
	});

	it("flips a morph: the path starts where it ended", () => {
		const { svg } = render([
			{ type: "Path", id: "p", props: { d: "M0 0 L10 0 L10 10" } },
			phrase(
				{ retrograde: true },
				[
					on("Motion", "m", "p", {
						steps: [{ to: { d: "M0 0 L10 10 L0 10" }, over: 1, ease: "hold" }],
					}),
				],
				"back",
			),
		]);
		expect(svg).toMatch(
			/values="M0 0 L10 10 L0 10;M0 0 L10 0 L10 10;M0 0 L10 0 L10 10" keyTimes="0;0.00001;1"/,
		);
	});

	it("runs a loop inside a phrase until the phrase ends", () => {
		const { ast } = render([
			box("a"),
			phrase({}, [
				{ type: "Rest", id: "hold", props: { over: 2 } },
				on("Shake", "shake", "a", { over: 0.5, loop: true, rate: 4 }),
			]),
			{ type: "Rest", props: { at: 2, over: 2 } },
		]);
		expect(ast.duration).toBe(4);
		// four passes of two shakes each, then still for the second half
		const body = keyframesOf(ast.css)[0];
		expect(body.match(/translate:-3px 0px/g)).toHaveLength(4);
		expect(body).toMatch(/50%\{translate:0px 0px\}100%\{translate:0px 0px\}$/);
	});

	it("skips the motions of a phrase with nothing to play", () => {
		const { ast } = render([
			box("a"),
			box("b"),
			on("Enter", "bIn", "b", { over: 1 }),
			phrase({}, [on("Enter", "in", "a", { over: 0 })]),
		]);
		expect(ast.children.map((c) => c.type)).toEqual(["rect", "g"]);
	});
});

describe("layout in time", () => {
	const rel = (
		type: string,
		ids: string[],
		props: Record<string, unknown> = {},
		id?: string,
	): N => ({ type, id, props, children: ids.map(ref) });
	const modulate = (
		id: string,
		children: N[],
		props: Record<string, unknown> = {},
	): N => ({ type: "Modulate", id, props, children });
	const resolve = (id: string, props: Record<string, unknown> = {}): N => ({
		type: "Resolve",
		id,
		props,
	});
	const phrase = (props: Record<string, unknown>, children: N[]): N => ({
		type: "Phrase",
		id: "p",
		props,
		children,
	});
	const row = (ids: string[], id = "row"): N => ({
		type: "StackH",
		id,
		props: { spacing: 10 },
		children: ids.map((i) => box(i, { "stroke-width": 0 })),
	});
	const swap = (props: Record<string, unknown> = {}) =>
		modulate("swap", [rel("StackH", ["b", "a"], { spacing: 10 })], {
			over: 1,
			ease: "linear",
			...props,
		});
	const keyframesOf = (css: string | undefined) =>
		[...(css ?? "").matchAll(/@keyframes [^{]+\{(.*)\}\n/g)].map((m) => m[1]);

	it("animates a scene whose only timed node is a Modulate", () => {
		const { ast } = render([row(["a", "b"]), swap()]);
		expect(ast.duration).toBe(1);
		expect(keyframesOf(ast.css)).toEqual([
			"0%{translate:0px 0px;animation-timing-function:linear}100%{translate:30px 0px}",
			"0%{translate:0px 0px;animation-timing-function:linear}100%{translate:-30px 0px}",
		]);
	});

	it("renders home when animation is off", () => {
		const scene = buildSceneFromJson({
			type: "Group",
			id: "root",
			children: [row(["a", "b"]), swap()],
		});
		const plain = buildSceneFromJson({
			type: "Group",
			id: "root",
			children: [row(["a", "b"])],
		});
		const svg = (s: typeof scene) =>
			serializeToSvg(
				layoutToAst(solveLayout(s), s.nodes, 0, { animation: false }),
			);
		expect(svg(scene)).toBe(svg(plain));
	});

	it("moves a modulated mark in a shell outside the shells of its motions", () => {
		const { ast } = render([
			row(["a", "b"]),
			on("Enter", "in", "a", { over: 1, from: { scale: 0 } }),
			swap(),
		]);
		const [outer] = ast.children;
		const inner = outer.type === "g" ? outer.children[0] : undefined;
		const classOf = (el: typeof inner) =>
			String(el?.attrs?.class).split(" ")[1];
		expect(inner?.type).toBe("g");
		expect(ast.css).toMatch(
			new RegExp(`\\.${classOf(outer)}\\{animation-name:[\\w-]+\\}`),
		);
		expect(ast.css).toMatch(
			new RegExp(`\\.${classOf(inner)}\\{animation-name:[\\w-]+;transform-box`),
		);
		// the outer shell is the translate
		const name = new RegExp(
			`\\.${classOf(outer)}\\{animation-name:([\\w-]+)\\}`,
		).exec(ast.css ?? "")?.[1];
		expect(ast.css).toContain(`@keyframes ${name}{0%{translate:0px 0px`);
	});

	it("resizes a background with width and height keyframes", () => {
		const { ast, svg } = render([
			{
				type: "Background",
				id: "bg",
				props: { padding: 5, "stroke-width": 1 },
				children: [
					{
						type: "StackV",
						id: "list",
						props: { spacing: 10 },
						children: [box("a"), box("b"), box("c")],
					},
				],
			},
			modulate("two", [rel("StackV", ["a", "c"], { spacing: 10 })], {
				over: 1,
				ease: "linear",
			}),
		]);
		// three rows of 20 with 10 between, 5 padding and the frame's 1 stroke
		expect(ast.css).toContain(
			"0%{height:91px;animation-timing-function:linear}100%{height:61px}",
		);
		expect(ast.css).not.toContain("width:");
		expect(svg).toMatch(/<rect id="bg"[^>]+class="ms\w+-a ms\w+-c\d"/);
	});

	const attached = () =>
		render(
			[
				row(["a", "b", "c"]),
				box("job", { width: 8, height: 8, y: 60 }),
				rel("Align", ["a", "job"], { alignment: "centerX" }),
				{ type: "Arrow", id: "arrow", children: [ref("a"), ref("job")] },
				modulate(
					"hop",
					[rel("Align", ["c", "job"], { alignment: "centerX" })],
					{ over: 1 },
				),
			],
			{ stillAt: 1 },
		);

	it("redraws an arrow whose end moves: two paths with d animations and still twins", () => {
		const { ast, svg } = attached();
		const paths = ast.children.filter((c) => c.type === "path");
		expect(paths.map((p) => p.id)).toEqual([
			"arrow",
			"arrow-still",
			"arrow-head",
			"arrow-head-still",
		]);
		for (const p of paths) {
			if (p.type !== "path") continue;
			const still = p.id?.endsWith("-still");
			expect(p.animate?.length ?? 0).toBe(still ? 0 : 1);
			expect(String(p.attrs?.class)).toMatch(still ? /-ds$/ : /-dm$/);
		}
		const shaft = paths[0].type === "path" ? paths[0] : undefined;
		const values = shaft?.animate?.[0].values.split(";") ?? [];
		// home, then sixteen samples along the ease
		expect(values).toHaveLength(17);
		expect(values[0]).toBe(shaft?.d);
		expect(new Set(values.map((v) => v.replace(/[-\d.]+/g, "n")))).toEqual(
			new Set(["M n,n L n,n"]),
		);
		// the still twin shows where it ends up
		expect(paths[1].type === "path" && paths[1].d).toBe(values[16]);
		expect(svg).toContain('<animate attributeName="d"');
		expect(ast.css).toMatch(/-ds\{display:none\}/);
	});

	it("leaves a static arrow a line and a polygon when nothing modulates", () => {
		const { ast } = render([
			row(["a", "b"]),
			{ type: "Arrow", id: "arrow", children: [ref("a"), ref("b")] },
			on("Enter", "in", "a"),
		]);
		expect(ast.children.map((c) => c.type)).toEqual([
			"g",
			"rect",
			"line",
			"polygon",
		]);
	});

	it("carries a connector whose ends move together in a shell, without SMIL", () => {
		const { ast, svg } = render([
			{
				type: "StackV",
				id: "page",
				props: { spacing: 10 },
				children: [row(["a", "b"]), box("c", { "stroke-width": 0 })],
			},
			{ type: "Arrow", id: "arrow", children: [ref("a"), ref("b")] },
			modulate("flip", [rel("StackV", ["c", "row"], { spacing: 10 })], {
				over: 1,
				ease: "linear",
			}),
		]);
		expect(svg).not.toContain("<animate");
		const shell = ast.children.find(
			(c) => c.type === "g" && c.children[0].id === "arrow",
		);
		expect(shell?.type === "g" && shell.children.map((c) => c.type)).toEqual([
			"line",
			"polygon",
		]);
		expect(ast.css).toContain("100%{translate:0px 30px}");
	});

	it("sizes the viewBox to cover every phase", () => {
		const still = render([row(["a", "b"]), on("Enter", "in", "a")]);
		const { ast } = render([
			row(["a", "b"]),
			modulate("apart", [rel("StackH", ["a", "b"], { spacing: 100 })]),
		]);
		expect(ast.width).toBeCloseTo(still.ast.width + 90, 3);
		expect(ast.height).toBeCloseTo(still.ast.height, 3);
	});

	it("reports a Motion that sizes what a Modulate resizes", () => {
		expect(() =>
			render([
				{
					type: "Background",
					id: "bg",
					children: [
						{ type: "StackV", id: "list", children: [box("a"), box("b")] },
					],
				},
				on("Motion", "grow", "bg", {
					steps: [{ to: { height: 100 }, over: 1 }],
				}),
				modulate("one", [rel("StackV", ["b", "a"], { spacing: 0 })], {
					over: 1,
				}),
			]),
		).toThrow(/one and grow both move height on bg/);
	});

	describe("inside a phrase", () => {
		const there = (props: Record<string, unknown>) =>
			render([
				row(["a", "b"]),
				phrase(props, [
					swap(),
					resolve("back", { at: 1, over: 1, ease: "linear" }),
				]),
			]);

		it("plays there and back twice over without a cut when it alternates", () => {
			const { ast } = there({ repeat: 2, alternate: true });
			expect(ast.duration).toBe(4);
			const [a] = keyframesOf(ast.css);
			expect(a).not.toContain("steps(");
			expect(
				[...a.matchAll(/([\d.]+)%\{translate:(-?\d+)px/g)].map((m) => [
					Number(m[1]),
					Number(m[2]),
				]),
			).toEqual([
				[0, 0],
				[25, 30],
				[50, 0],
				[75, 30],
				[100, 0],
			]);
		});

		it("starts modulated and ends home in retrograde", () => {
			const { ast } = render([
				row(["a", "b"]),
				phrase({ retrograde: true }, [swap()]),
			]);
			expect(keyframesOf(ast.css)[0]).toBe(
				"0%{translate:30px 0px;animation-timing-function:linear}100%{translate:0px 0px}",
			);
		});

		it("halves the tween at rate 2", () => {
			const { ast } = render([row(["a", "b"]), phrase({ rate: 2 }, [swap()])], {
				duration: 1,
			});
			expect(keyframesOf(ast.css)[0]).toBe(
				"0%{translate:0px 0px;animation-timing-function:linear}50%{translate:30px 0px}100%{translate:30px 0px}",
			);
		});

		it("retimes a redrawn connector with it", () => {
			const { ast } = render([
				row(["a", "b"]),
				box("job", { width: 8, height: 8, y: 60 }),
				rel("Align", ["a", "job"], { alignment: "centerX" }),
				{ type: "Line", id: "wire", children: [ref("a"), ref("job")] },
				phrase({ retrograde: true }, [
					modulate(
						"hop",
						[rel("Align", ["b", "job"], { alignment: "centerX" })],
						{ over: 1 },
					),
				]),
			]);
			const wire = ast.children.find((c) => c.id === "wire");
			const values =
				(wire?.type === "path" && wire.animate?.[0].values.split(";")) || [];
			// it starts where the forward pass ends, and ends at home
			expect(values.at(-1)).toBe(wire?.type === "path" && wire.d);
			expect(values[0]).not.toBe(values.at(-1));
		});
	});
});
