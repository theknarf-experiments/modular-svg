import fc from "fast-check";
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

	it("morphs path data on the CSS clock as well, for browsers that animate d", () => {
		const { ast } = render([
			{ type: "Path", id: "p", props: { d: "M 0 0 L 10 0" } },
			on("Motion", "m", "p", {
				steps: [{ to: { d: "M 0 0 L 10 10" }, over: 1, ease: "linear" }],
			}),
		]);
		expect(ast.css).toContain(
			'0%{d:path("M 0 0 L 10 0");animation-timing-function:linear}100%{d:path("M 0 0 L 10 10")}',
		);
		const [moving, still] = ast.children;
		expect(moving.type === "path" && moving.animate).toHaveLength(1);
		expect(String(moving.attrs?.class)).toMatch(/^ms\w+-a ms\w+-c\d ms\w+-dm$/);
		expect(String(still.attrs?.class)).toMatch(/^ms\w+-a ms\w+-c\d ms\w+-ds$/);
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

	it("replays a backward pass from its cut, whatever the rounding", () => {
		for (const at of [0.1, 0.2, 0.3, 0.4, 0.7])
			for (const over of [0.1, 0.2, 0.3, 0.6]) {
				const { ast } = render([
					box("a"),
					phrase({ retrograde: true, repeat: 2 }, [
						on("Enter", "in", "a", { at, over, ease: "linear" }),
					]),
				]);
				const body = keyframesOf(ast.css)[0];
				// both passes fade out, and the phrase ends hidden
				expect(
					body.match(/opacity:1;animation-timing-function:linear/g),
				).toHaveLength(2);
				expect(body).toMatch(/100%\{opacity:0\}$/);
			}
		const { ast } = render([
			box("a"),
			phrase({ retrograde: true, repeat: 2 }, [
				on("Enter", "in", "a", { at: 0.1, over: 0.2, ease: "linear" }),
			]),
		]);
		expect(keyframesOf(ast.css)[0]).toBe(
			"0%{opacity:1;animation-timing-function:linear}33.333%{opacity:0;animation-timing-function:steps(1)}50%{opacity:1;animation-timing-function:linear}83.333%{opacity:0}100%{opacity:0}",
		);
	});

	it("plays a cut after a tween backwards as the cut before it", () => {
		const { ast } = render([
			box("a"),
			phrase({ retrograde: true }, [
				on("Motion", "m", "a", {
					at: 0.2,
					steps: [
						{ to: { x: 35 }, over: 0.5, ease: "linear" },
						{ set: { x: 62 } },
					],
				}),
			]),
		]);
		expect(keyframesOf(ast.css)[0]).toBe(
			"0%{translate:35px 0px;animation-timing-function:linear}71.429%{translate:0px 0px}100%{translate:0px 0px}",
		);
	});

	it("counts every pass of a numbered loop towards the phrase", () => {
		const looped = [
			box("a"),
			phrase({}, [
				on("Enter", "in", "a", { over: 1, loop: 3, ease: "linear" }),
			]),
		];
		const alone = render(looped);
		expect(alone.ast.duration).toBe(3);
		expect(keyframesOf(alone.ast.css)[0]).toBe(
			keyframesOf(
				render([
					box("a"),
					on("Enter", "in", "a", { over: 1, loop: 3, ease: "linear" }),
				]).ast.css,
			)[0],
		);
		// and holds its last frame when the scene goes on
		const held = render([
			...looped,
			{ type: "Rest", props: { at: 0, over: 6 } },
		]);
		expect(keyframesOf(held.ast.css)[0]).toMatch(
			/33\.33\d+%\{opacity:0;animation-timing-function:linear\}50%\{opacity:1\}100%\{opacity:1\}$/,
		);
	});

	const paint = (id: string, at: number, fill: string) =>
		on("Motion", id, "a", {
			at,
			steps: [{ to: { fill }, over: 1, ease: "linear" }],
		});

	it("plays two motions on one replaced lane backwards as their mirror", () => {
		const colors = [paint("m1", 0, "#ff0000"), paint("m2", 1, "#0000ff")];
		const back = render([box("a"), phrase({ retrograde: true }, colors)]);
		expect(keyframesOf(back.ast.css)[0]).toBe(
			"0%{fill:#0000ff;animation-timing-function:linear}50%{fill:#ff0000;animation-timing-function:linear}100%{fill:#fff}",
		);
		const pong = render([
			box("a"),
			phrase({ repeat: 2, alternate: true }, colors),
		]);
		expect(keyframesOf(pong.ast.css)[0]).toBe(
			"0%{fill:#fff;animation-timing-function:linear}25%{fill:#ff0000;animation-timing-function:linear}50%{fill:#0000ff;animation-timing-function:linear}75%{fill:#ff0000;animation-timing-function:linear}100%{fill:#fff}",
		);
	});

	it("mirrors a replaced lane shared with a nested phrase", () => {
		const { ast } = render([
			box("a"),
			phrase(
				{ retrograde: true },
				[
					paint("m1", 0, "#ff0000"),
					phrase({ at: 1 }, [paint("m2", 0, "#0000ff")], "inner"),
				],
				"outer",
			),
		]);
		expect(keyframesOf(ast.css)[0]).toBe(
			"0%{fill:#0000ff;animation-timing-function:linear}50%{fill:#ff0000;animation-timing-function:linear}100%{fill:#fff}",
		);
	});

	it("cuts to a backward phrase's first frame where the phrase starts, not at 0", () => {
		const { ast } = render([
			box("a"),
			paint("m0", 0, "#ff0000"),
			phrase({ at: 2, retrograde: true }, [paint("m1", 0, "#0000ff")]),
		]);
		// the phrase's tape is red to blue, so backwards it gives red back
		expect(keyframesOf(ast.css)[0]).toBe(
			"0%{fill:#fff;animation-timing-function:linear}33.333%{fill:#ff0000;animation-timing-function:steps(1)}66.667%{fill:#0000ff;animation-timing-function:linear}100%{fill:#ff0000}",
		);
	});

	it("starts each phrase on a lane from what the one before left", () => {
		const { ast } = render([
			box("a"),
			phrase({ repeat: 2, alternate: true }, [paint("m1", 0, "#0000ff")]),
			phrase({ at: 3, retrograde: true }, [paint("m2", 0, "#00ff00")], "q"),
		]);
		expect(keyframesOf(ast.css)[0]).toBe(
			"0%{fill:#fff;animation-timing-function:linear}25%{fill:#0000ff;animation-timing-function:linear}50%{fill:#fff;animation-timing-function:steps(1)}75%{fill:#00ff00;animation-timing-function:linear}100%{fill:#fff}",
		);
	});

	it("cuts to a later motion's from where it starts, when another moved the lane first", () => {
		const { ast } = render([
			box("a"),
			paint("m0", 0, "#ff0000"),
			on("Motion", "m1", "a", {
				at: 2,
				from: { fill: "#0000ff" },
				steps: [{ to: { fill: "#00ff00" }, over: 1, ease: "linear" }],
			}),
		]);
		expect(keyframesOf(ast.css)[0]).toBe(
			"0%{fill:#fff;animation-timing-function:linear}33.333%{fill:#ff0000;animation-timing-function:steps(1)}66.667%{fill:#0000ff;animation-timing-function:linear}100%{fill:#00ff00}",
		);
	});

	it("keeps the first frame inside an outer phrase, and on width", () => {
		const { ast } = render([
			box("a"),
			phrase(
				{},
				[
					on("Motion", "m0", "a", {
						steps: [{ to: { width: 50 }, over: 1, ease: "linear" }],
					}),
					phrase({ at: 2, retrograde: true }, [
						on("Motion", "m1", "a", {
							steps: [{ to: { width: 80 }, over: 1, ease: "linear" }],
						}),
					]),
				],
				"outer",
			),
		]);
		expect(keyframesOf(ast.css)[0]).toBe(
			"0%{width:20px;animation-timing-function:linear}33.333%{width:50px;animation-timing-function:steps(1)}66.667%{width:80px;animation-timing-function:linear}100%{width:50px}",
		);
	});

	it("repeats a phrase from where its lane was when it began", () => {
		const { ast } = render([
			box("a"),
			paint("m0", 0, "#ff0000"),
			phrase({ at: 2, repeat: 2 }, [paint("m1", 0, "#0000ff")]),
		]);
		expect(keyframesOf(ast.css)[0]).toBe(
			"0%{fill:#fff;animation-timing-function:linear}25%{fill:#ff0000}50%{fill:#ff0000;animation-timing-function:linear}75%{fill:#0000ff;animation-timing-function:steps(1)}75.001%{fill:#ff0000;animation-timing-function:linear}100%{fill:#0000ff}",
		);
	});

	it("still refuses two motions in a phrase moving one replaced lane at once", () => {
		expect(() =>
			render([
				box("a"),
				phrase({ retrograde: true }, [
					paint("m1", 0, "#ff0000"),
					paint("m2", 0.5, "#0000ff"),
				]),
			]),
		).toThrow(/m1 and m2 both move fill on a/);
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

	it("holds a change of layout that takes no time, with nothing else timed", () => {
		const { ast } = render([row(["a", "b"]), swap({ at: 0, over: 0 })]);
		expect(keyframesOf(ast.css)).toEqual([
			"0%{translate:30px 0px}100%{translate:30px 0px}",
			"0%{translate:-30px 0px}100%{translate:-30px 0px}",
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

	it("moves a modulated mark in a shell inside those of its motions, whose pivot follows it", () => {
		const { ast } = render([
			row(["a", "b"]),
			on("Enter", "in", "a", { over: 1, from: { scale: 0 } }),
			swap(),
		]);
		const [outer] = ast.children;
		const inner = outer.type === "g" ? outer.children[0] : undefined;
		const ruleOf = (el: typeof inner) =>
			new RegExp(
				`\\.${String(el?.attrs?.class).split(" ")[1]}\\{animation-name:([\\w,-]+)([^}]*)\\}`,
			).exec(ast.css ?? "");
		const framesOf = (name: string | undefined) =>
			new RegExp(`@keyframes ${name}\\{(.*)\\}\n`).exec(ast.css ?? "")?.[1];
		expect(inner?.type).toBe("g");
		// the outer shell scales, about a's centre wherever the swap has it
		const [scale, origin] = ruleOf(outer)?.[1].split(",") ?? [];
		expect(framesOf(scale)).toContain("0%{scale:0");
		expect(ruleOf(outer)?.[2]).toBe(
			";transform-box:view-box;transform-origin:10px 10px",
		);
		expect(framesOf(origin)).toBe(
			"0%{transform-origin:10px 10px;animation-timing-function:linear}100%{transform-origin:40px 10px}",
		);
		// the inner one is the translate
		expect(ruleOf(inner)?.[2]).toBe("");
		expect(framesOf(ruleOf(inner)?.[1])).toContain("0%{translate:0px 0px");
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

	/** The keyframes of each shell around a mark, outermost first, and its rule. */
	const shellsOf = (
		ast: ReturnType<typeof render>["ast"],
		id: string,
	): { rule: string; frames: string[] }[] => {
		const frames = new Map(
			[...(ast.css ?? "").matchAll(/@keyframes ([^{]+)\{(.*)\}\n/g)].map(
				(m) => [m[1], m[2]],
			),
		);
		const find = (
			els: typeof ast.children,
			path: string[],
		): string[] | undefined => {
			for (const el of els) {
				if (el.id === id) return path;
				if (el.type !== "g") continue;
				const cls = String(el.attrs?.class);
				const found = find(el.children, [...path, cls]);
				if (found) return found;
			}
			return undefined;
		};
		return (find(ast.children, []) ?? []).map((cls) => {
			const rule =
				new RegExp(`\\.${cls.split(" ")[1]}\\{([^}]*)\\}`).exec(
					ast.css ?? "",
				)?.[1] ?? "";
			const names = /animation-name:([^;]+)/.exec(rule)?.[1].split(",") ?? [];
			return { rule, frames: names.map((n) => frames.get(n) ?? "") };
		});
	};
	const lanes = (shell: { frames: string[] } | undefined) =>
		(shell?.frames ?? []).map((f) => /\{([a-z-]+):/.exec(f)?.[1]);
	const list = (ids: string[]): N => ({
		type: "StackV",
		id: "list",
		props: { spacing: 8 },
		children: ids.map((i) =>
			box(i, { width: 40, height: 10, "stroke-width": 0 }),
		),
	});

	it("turns a reordered list about the list as it then looks", () => {
		const { ast } = render([
			list(["a", "b", "c"]),
			modulate("m", [rel("StackV", ["c", "a", "b"], { spacing: 8 }, "o")], {
				at: 1,
				over: 1,
				ease: "linear",
			}),
			on("Motion", "spin", "list", {
				at: 2.5,
				steps: [{ to: { rotate: 180 }, over: 1, ease: "linear" }],
			}),
		]);
		// each mark first goes where the layout puts it, and the list turns as one
		const [outer, inner] = shellsOf(ast, "c");
		expect(lanes(outer)).toEqual(["rotate"]);
		expect(outer.rule).toContain("transform-origin:20px 23px");
		expect(lanes(inner)).toEqual(["translate"]);
		expect(inner.frames[0]).toContain("{translate:0px -36px}");
	});

	it("moves the pivot with a mark that a Modulate moves and resizes", () => {
		const scene = [
			{
				type: "StackV",
				id: "col",
				props: { spacing: 10 },
				children: ["a", "b"].map((id) => ({
					type: "Rect",
					id,
					props: { height: 10, "stroke-width": 0 },
				})),
			},
			modulate(
				"m",
				[rel("StackH", ["a", "b"], { spacing: 10, total: 130 }, "o")],
				{ at: 1, over: 1, ease: "linear" },
			),
			on("Motion", "spin", "b", {
				at: 2.5,
				steps: [{ to: { rotate: 180 }, over: 1, ease: "linear" }],
			}),
		];
		const { ast } = render(scene);
		const built = buildSceneFromJson({
			type: "Group",
			id: "root",
			children: scene,
		});
		const b = solveLayout(built).b;
		const to = b.phases?.m ?? b;
		const centre = (r: typeof to) => [r.x + r.width / 2, r.y + r.height / 2];
		const [outer] = shellsOf(ast, "b");
		expect(lanes(outer)).toEqual(["rotate", "transform-origin"]);
		const origins = [
			...outer.frames[1].matchAll(
				/transform-origin:(-?[\d.]+)px (-?[\d.]+)px/g,
			),
		].map((m) => [Number(m[1]), Number(m[2])]);
		const [first, last] = [origins[0], origins[origins.length - 1]];
		expect(to.width).toBeGreaterThan(10);
		expect(last[0] - first[0]).toBeCloseTo(centre(to)[0] - centre(b)[0], 2);
		expect(last[1] - first[1]).toBeCloseTo(centre(to)[1] - centre(b)[1], 2);
		expect(outer.rule).toContain(
			`transform-origin:${first[0]}px ${first[1]}px`,
		);
	});

	const numbers = (list: string | undefined) =>
		(list ?? "").split(";").map(Number);
	const increasing = (times: number[]) =>
		times.every((t, i) => i === 0 || t > times[i - 1]);

	it("redraws a connector between ends that modulations in two clocks move", () => {
		const pair = (id: string, ids: string[]): N => ({
			type: "StackH",
			id,
			props: { spacing: 20 },
			children: ids.map((i) => box(i, { "stroke-width": 0 })),
		});
		const { ast } = render([
			{
				type: "StackV",
				id: "col",
				props: { spacing: 40 },
				children: [pair("r1", ["a", "a2"]), pair("r2", ["b", "b2"])],
			},
			{ type: "Line", id: "k", children: [ref("a"), ref("b")] },
			modulate("m", [rel("StackH", ["a2", "a"], { spacing: 20 })], {
				at: 1,
				over: 1,
			}),
			{
				type: "Phrase",
				id: "ph",
				props: { at: 1 },
				children: [
					modulate("n", [rel("StackH", ["b2", "b"], { spacing: 20 })], {
						at: 0,
						over: 1,
					}),
				],
			},
		]);
		const wire = ast.children.find((c) => c.id === "k");
		const smil = wire?.type === "path" ? wire.animate?.[0] : undefined;
		expect(increasing(numbers(smil?.keyTimes))).toBe(true);
		const values = smil?.values.split(";") ?? [];
		const ends = (d: string) =>
			[...(/M (-?[\d.]+),(-?[\d.]+) L (-?[\d.]+),(-?[\d.]+)/.exec(d) ?? [])]
				.slice(1)
				.map(Number);
		// both ends moved 40 to the right, so the line is upright again
		const [x1, y1, x2, y2] = ends(values[0]);
		expect(ends(values[values.length - 1])).toEqual([x1 + 40, y1, x2 + 40, y2]);
		// half way both are half way: neither clock's path alone
		const mid = ends(values[Math.floor(values.length / 2)]);
		expect(mid[0]).toBeCloseTo(mid[2], 1);
		expect(mid[0]).toBeGreaterThan(x1);
		expect(mid[0]).toBeLessThan(x1 + 40);
	});

	it("adds up the sizes modulations in two clocks give one box", () => {
		const scene = [
			{
				type: "Background",
				id: "bg",
				props: { padding: 6, "stroke-width": 0 },
				children: [
					{
						type: "StackH",
						id: "row",
						props: { spacing: 5 },
						children: ["a", "b", "c"].map((i) => box(i, { "stroke-width": 0 })),
					},
				],
			},
			modulate("m", [rel("StackV", ["a", "b"], { spacing: 5 })], {
				at: 1,
				over: 1,
				ease: "linear",
			}),
			{
				type: "Phrase",
				id: "ph",
				props: { at: 1.5 },
				children: [
					modulate("n", [rel("StackV", ["b", "c"], { spacing: 5 })], {
						at: 0,
						over: 1,
						ease: "linear",
					}),
				],
			},
		];
		const built = buildSceneFromJson({
			type: "Group",
			id: "root",
			children: scene,
		});
		const bg = solveLayout(built).bg;
		const [m, n] = [bg.phases?.m ?? bg, bg.phases?.n ?? bg];
		const { ast } = render(scene);
		for (const side of ["width", "height"] as const) {
			const frames = keyframesOf(ast.css).find((f) =>
				f.startsWith(`0%{${side}:`),
			);
			const sizes = [
				...(frames ?? "").matchAll(/([\d.]+)%\{[a-z]+:(-?[\d.]+)px/g),
			].map((f) => [Number(f[1]), Number(f[2])]);
			expect(increasing(sizes.map(([t]) => t))).toBe(true);
			const at = (percent: number) =>
				sizes.find(([t]) => Math.abs(t - percent) < 0.01)?.[1];
			expect(at(0)).toBeCloseTo(bg[side], 2);
			// m is half done when n starts, and both have played by the end
			expect(at(60)).toBeCloseTo(bg[side] + (m[side] - bg[side]) / 2, 2);
			expect(at(100)).toBeCloseTo(
				bg[side] + (m[side] - bg[side]) + (n[side] - bg[side]),
				2,
			);
		}
	});

	it("moves a redrawn connector on the CSS clock too, where the browser can", () => {
		const { ast } = attached();
		const arrow = ast.children.find((c) => c.id === "arrow");
		const smil = arrow?.type === "path" ? arrow.animate?.[0] : undefined;
		const cls = String(arrow?.attrs?.class).split(" ");
		const rule = new RegExp(`\\.${cls[1]}\\{animation-name:([\\w-]+)\\}`).exec(
			ast.css ?? "",
		);
		const frames = new RegExp(`@keyframes ${rule?.[1]}\\{(.*)\\}\n`).exec(
			ast.css ?? "",
		)?.[1];
		const paths = [...(frames ?? "").matchAll(/d:path\("([^"]+)"\)/g)].map(
			(m) => m[1],
		);
		expect(paths.length).toBeGreaterThan(2);
		expect(paths).toEqual(smil?.values.split(";"));
		// the still twin holds its frame without the animation
		const still = ast.children.find((c) => c.id === "arrow-still");
		expect(String(still?.attrs?.class)).not.toContain(cls[1]);
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

describe("replaced lanes (properties)", () => {
	const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
	it("shows a later motion's colors only once it has started, in or out of a phrase", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						gap: fc.constantFrom(0, 0.5, 1),
						from: fc.boolean(),
						phrase: fc.constantFrom("none", "forward", "retrograde", "pong"),
					}),
					{ minLength: 1, maxLength: 5 },
				),
				(parts) => {
					let at = 0;
					const starts: number[] = [];
					const children: N[] = [box("a", { fill: "#ffffff" })];
					parts.forEach((part, i) => {
						const start = at + part.gap;
						const passes = part.phrase === "pong" ? 2 : 1;
						starts.push(start);
						at = start + passes;
						// colors no other motion uses: 0x10000 * (i + 1) + 1 or 2
						const motion = on("Motion", `m${i}`, "a", {
							...(part.phrase === "none" ? { at: start } : {}),
							...(part.from
								? { from: { fill: hex((i + 1) * 65536 + 1) } }
								: {}),
							steps: [
								{
									to: { fill: hex((i + 1) * 65536 + 2) },
									over: 1,
									ease: "linear",
								},
							],
						});
						children.push(
							part.phrase === "none"
								? motion
								: {
										type: "Phrase",
										id: `p${i}`,
										props: {
											at: start,
											...(part.phrase === "retrograde"
												? { retrograde: true }
												: {}),
											...(part.phrase === "pong"
												? { repeat: 2, alternate: true }
												: {}),
										},
										children: [motion],
									},
						);
					});
					const { ast } = render(children);
					const period = ast.duration ?? 0;
					const frames = [
						...(ast.css ?? "").matchAll(/([\d.]+)%\{fill:(#[0-9a-f]+)/g),
					].map((m) => ({ t: (Number(m[1]) / 100) * period, fill: m[2] }));
					for (const { t, fill } of frames) {
						if (fill === "#ffffff") continue;
						const owner = Math.floor(
							Number.parseInt(fill.slice(1), 16) / 65536,
						);
						// the first to move the lane also says where it starts
						if (owner === 1) continue;
						expect(t).toBeGreaterThanOrEqual(starts[owner - 1] - period * 2e-5);
					}
				},
			),
		);
	});
});
