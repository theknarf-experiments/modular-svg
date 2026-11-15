import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { layoutToSvg } from "./output.ts";
import { buildSceneFromJson, checkSolution } from "./parser.ts";
import { clipOp, solveLayout } from "./solver/index.ts";
import {
	type GroupElement,
	layoutBounds,
	layoutToAst,
	type SvgElement,
} from "./svg_ast.ts";

type N = Record<string, unknown>;
const ref = (target: string): N => ({ type: "Ref", target });
const rect = (id: string, props: N = {}): N => ({
	type: "Rect",
	id,
	props: { width: 40, height: 20, "stroke-width": 0, fill: "#888", ...props },
});
const clip = (id: string, children: N[], props: N = {}, type = "Clip"): N => ({
	type,
	id,
	props,
	children,
});
const sceneOf = (children: N[]) =>
	buildSceneFromJson({ type: "Group", id: "root", children });
const solved = (children: N[]) => {
	const scene = sceneOf(children);
	const layout = solveLayout(scene);
	return { scene, layout, byId: new Map(scene.nodes.map((n) => [n.id, n])) };
};
const astOf = (children: N[], opts: Parameters<typeof layoutToAst>[3] = {}) => {
	const { scene, layout } = solved(children);
	return layoutToAst(layout, scene.nodes, 0, opts);
};
/** Every element under the given ones, groups included, outermost first. */
const flat = (els: readonly SvgElement[]): SvgElement[] =>
	els.flatMap((el) => (el.type === "g" ? [el, ...flat(el.children)] : [el]));
const ids = (els: readonly SvgElement[]) =>
	flat(els)
		.filter((el) => el.type !== "g")
		.map((el) => el.id);
const groupOf = (els: readonly SvgElement[], id: string) =>
	flat(els).find((el) => el.type === "g" && el.id === id) as GroupElement;

describe("clipOp", () => {
	const state = (boxes: number[][]) => Float64Array.from(boxes.flat());
	const run = (boxes: number[][], inverse = false) => {
		const cur = state([...boxes, [0, 0, 0, 0]]);
		const next = Float64Array.from(cur);
		const op = clipOp([0], [4, 8], 12, inverse);
		op(cur, next);
		return { box: [...next.slice(12)], writes: op.writes };
	};

	it("writes the content's box cut to the shape's", () => {
		const { box, writes } = run([
			[10, 5, 50, 20],
			[0, 0, 30, 10],
			[20, 8, 100, 40],
		]);
		expect(box).toEqual([10, 5, 50, 20]);
		expect(writes).toEqual([12, 13, 14, 15]);
	});

	it("has no size where shape and content do not meet", () => {
		const { box } = run([
			[200, 300, 10, 10],
			[0, 0, 30, 10],
			[20, 8, 100, 40],
		]);
		expect(box).toEqual([200, 300, 0, 0]);
	});

	it("is the content's box when inverse", () => {
		const { box } = run(
			[
				[10, 5, 50, 20],
				[0, 0, 30, 10],
				[20, 8, 100, 40],
			],
			true,
		);
		expect(box).toEqual([0, 0, 120, 48]);
	});

	it("is inside both the shape and the content, whatever they are", () => {
		const boxArb = fc.tuple(
			fc.integer({ min: -100, max: 100 }),
			fc.integer({ min: -100, max: 100 }),
			fc.integer({ min: 0, max: 120 }),
			fc.integer({ min: 0, max: 120 }),
		);
		fc.assert(
			fc.property(boxArb, boxArb, boxArb, (shape, a, b) => {
				const [x, y, w, h] = run([shape, a, b]).box;
				const left = Math.min(a[0], b[0]);
				const top = Math.min(a[1], b[1]);
				const right = Math.max(a[0] + a[2], b[0] + b[2]);
				const bottom = Math.max(a[1] + a[3], b[1] + b[3]);
				expect(w).toBeGreaterThanOrEqual(0);
				expect(h).toBeGreaterThanOrEqual(0);
				if (w === 0 || h === 0) return;
				for (const [l, t, r, d] of [
					[shape[0], shape[1], shape[0] + shape[2], shape[1] + shape[3]],
					[left, top, right, bottom],
				]) {
					expect(x).toBeGreaterThanOrEqual(l);
					expect(y).toBeGreaterThanOrEqual(t);
					expect(x + w).toBeLessThanOrEqual(r);
					expect(y + h).toBeLessThanOrEqual(d);
				}
			}),
		);
	});
});

describe("Clip and Mask in the parser", () => {
	it("marks the shape and what is inside, innermost clip first", () => {
		const { byId, scene } = solved([
			clip("outer", [
				rect("window", { width: 100, height: 50 }),
				rect("a"),
				clip("inner", [
					rect("hole"),
					{ type: "Group", id: "g", children: [rect("b")] },
				]),
			]),
			rect("free"),
		]);
		expect(scene.warnings).toEqual([]);
		expect(byId.get("window")?.shapes).toBe("outer");
		expect(byId.get("window")?.within).toBeUndefined();
		expect(byId.get("a")?.within).toBe("outer");
		expect(byId.get("inner")?.within).toBe("outer");
		expect(byId.get("hole")).toMatchObject({ shapes: "inner" });
		expect(byId.get("hole")?.within).toBeUndefined();
		expect(byId.get("g")?.within).toBe("inner");
		expect(byId.get("b")?.within).toBe("inner");
		expect(byId.get("free")?.within).toBeUndefined();
		expect(byId.get("outer")?.matte).toEqual({
			kind: "clip",
			by: "luminance",
			inverse: false,
			feather: 0,
			shapes: ["window"],
		});
	});

	it("paints a Clip's shape so that its geometry is what cuts", () => {
		const { byId } = solved([
			rect("a", { x: 0 }),
			rect("b", { x: 200 }),
			{
				type: "Line",
				id: "wire",
				props: { stroke: "red" },
				children: [ref("a"), ref("b")],
			},
			{ type: "Arrow", id: "aim", children: [ref("a"), ref("b")] },
			{
				type: "Group",
				id: "shape",
				children: [
					rect("window", { fill: "none", stroke: "blue", "stroke-width": 4 }),
					{ type: "Circle", id: "dot", props: { r: 5 } },
				],
			},
			clip("c", [ref("shape"), rect("x")]),
			clip("l", [ref("wire"), rect("y")]),
			clip("r", [ref("aim"), rect("z")], { inverse: true }),
		]);
		expect(byId.get("window")).toMatchObject({
			fill: "white",
			stroke: "none",
			strokeWidth: 0,
			shapes: "c",
		});
		expect(byId.get("dot")).toMatchObject({ fill: "white", stroke: "none" });
		expect(byId.get("wire")).toMatchObject({ stroke: "white", strokeWidth: 3 });
		expect(byId.get("aim")).toMatchObject({ stroke: "black", fill: "black" });
		expect(byId.get("r")?.matte?.inverse).toBe(true);
	});

	it("leaves a Mask's shape painted as authored and reads by and feather", () => {
		const { byId, scene } = solved([
			clip(
				"m",
				[rect("shape", { fill: "rgba(0,0,0,0.5)" }), rect("x")],
				{ by: "luminance", feather: 12 },
				"Mask",
			),
			clip("n", [rect("other"), rect("y")], {}, "Mask"),
		]);
		expect(scene.warnings).toEqual([]);
		expect(byId.get("shape")?.fill).toBe("rgba(0,0,0,0.5)");
		expect(byId.get("m")?.matte).toEqual({
			kind: "mask",
			by: "luminance",
			inverse: false,
			feather: 12,
			shapes: ["shape"],
		});
		expect(byId.get("n")?.matte?.by).toBe("alpha");
	});

	const warningsOf = (children: N[]) => sceneOf(children).warnings;

	it("warns about a clip with no shape or nothing to show", () => {
		expect(warningsOf([clip("c", [])])).toEqual([
			"Clip(c) has no shape: its first child is the shape, the rest is what shows inside it",
		]);
		expect(warningsOf([clip("m", [rect("s")], {}, "Mask")])).toEqual([
			"Mask(m) has a shape and nothing to show inside it",
		]);
	});

	it("warns about a shape that draws nothing and reads the clip as a Group", () => {
		const scene = sceneOf([
			clip("c", [{ type: "Group", id: "empty", children: [] }, rect("x")]),
		]);
		expect(scene.warnings).toEqual([
			"Clip(c): its shape empty draws nothing, so the clip is ignored",
		]);
		const byId = new Map(scene.nodes.map((n) => [n.id, n]));
		expect(byId.get("c")?.matte).toBeUndefined();
		expect(byId.get("x")?.within).toBeUndefined();
	});

	it("warns about content named by a ref", () => {
		expect(
			warningsOf([rect("far"), clip("c", [rect("s"), rect("x"), ref("far")])]),
		).toEqual([
			"Clip(c) refs far after its shape; what a clip shows is declared inside it, so the ref is ignored",
		]);
	});

	it("warns about a mark that would shape two clips", () => {
		const scene = sceneOf([
			rect("s"),
			clip("a", [ref("s"), rect("x")]),
			clip("b", [ref("s"), rect("y")]),
		]);
		expect(scene.warnings).toEqual([
			"Clip(b): s already shapes Clip(a) and a mark shapes one clip, so Clip(b) is ignored; give it a shape of its own and move both with one motion",
		]);
		expect(scene.nodes.find((n) => n.id === "b")?.matte).toBeUndefined();
		expect(scene.nodes.find((n) => n.id === "y")?.within).toBeUndefined();
	});

	it("warns about a shape that holds its own clip, or another", () => {
		expect(
			warningsOf([
				{
					type: "Group",
					id: "g",
					children: [clip("c", [ref("g"), rect("x")])],
				},
			]),
		).toEqual([
			"Clip(c): its shape g holds the Clip itself, so the clip is ignored",
		]);
		const scene = sceneOf([
			clip("b", [rect("s"), rect("x")]),
			clip("a", [ref("b"), rect("y")]),
		]);
		expect(scene.warnings).toEqual([
			"Clip(a): its shape holds Clip(b), which is not applied there; a shape is plain marks",
		]);
		const byId = new Map(scene.nodes.map((n) => [n.id, n]));
		expect(byId.get("b")?.matte).toBeUndefined();
		expect(byId.get("a")?.matte?.shapes).toEqual(["s", "x"]);
	});

	it("warns about a paint motion on a Clip's shape, but not on a Mask's", () => {
		const fade = (target: string): N => ({
			type: "Motion",
			id: `fade-${target}`,
			props: { steps: [{ to: { fill: "red" }, over: 1 }] },
			children: [ref(target)],
		});
		expect(
			warningsOf([
				clip("c", [rect("s"), rect("x")]),
				clip("m", [rect("t"), rect("y")], {}, "Mask"),
				fade("s"),
				fade("t"),
			]),
		).toEqual([
			"Motion(fade-s) animates fill on s, the shape of Clip(c); a Clip is cut by geometry and ignores paint (use a Mask)",
		]);
	});

	it("lets a paint motion on the clip itself recolour its content", () => {
		const tint = (target: string): N => ({
			type: "Motion",
			id: "tint",
			props: { steps: [{ to: { fill: "blue" }, over: 1 }] },
			children: [ref(target)],
		});
		const c = clip("c", [rect("s"), rect("x")]);
		expect(warningsOf([c, tint("c")])).toEqual([]);
		expect(
			warningsOf([{ type: "Group", id: "g", children: [c] }, tint("g")]),
		).toEqual([]);
	});

	it("warns about content of one clip that shapes another", () => {
		const scene = sceneOf([
			clip("c1", [rect("s1"), rect("k1")]),
			clip("c2", [ref("k1"), rect("k2")]),
		]);
		expect(scene.warnings).toEqual([
			"Clip(c2): its shape k1 is inside Clip(c1), and a shape is not drawn, so k1 no longer shows there; declare a second mark and Span or Align it",
		]);
		// A shape declared in its own clip, itself inside another, is no such thing
		expect(
			warningsOf([
				clip("outer", [rect("s"), clip("inner", [rect("t"), rect("x")])]),
			]),
		).toEqual([]);
	});

	it("warns about props it cannot read", () => {
		expect(
			warningsOf([
				clip(
					"m",
					[rect("s"), rect("x")],
					{ by: "red", inverse: true, feather: -2 },
					"Mask",
				),
			]),
		).toEqual([
			'Mask(m): by must be "alpha" or "luminance"; read as "alpha"',
			"Mask(m): inverse only applies to a Clip; paint the shape the other way round instead",
			"Mask(m): feather must be 0 or more; read as 0",
		]);
	});

	it("is framed by a camera as what it shows", () => {
		const { byId } = solved([
			clip("c", [rect("s"), rect("x", { width: 900 })]),
			{ type: "Group", id: "g", children: [rect("y")] },
			{
				type: "Camera",
				id: "look",
				children: [ref("c"), ref("g")],
			},
		]);
		expect(byId.get("look")?.camera?.frames).toEqual(["c", "y"]);
	});

	it("is read as declared outside when written in a Modulate", () => {
		const scene = sceneOf([
			{
				type: "Modulate",
				id: "mod",
				children: [clip("c", [rect("s"), rect("x")])],
			},
		]);
		expect(scene.warnings[0]).toContain("Clip cannot be modulated");
	});

	it("tells of a shape with no area at rest", () => {
		const { scene, layout } = solved([
			clip("c", [rect("s", { width: 0 }), rect("x")]),
			clip("i", [rect("t", { width: 0 }), rect("y")], { inverse: true }),
		]);
		expect(checkSolution(scene, layout)).toEqual([
			"Clip(c): its shape has no area at rest, so a render without animation shows nothing inside it; let the shape rest open and give the motion a from",
		]);
	});

	it("gives the clip the box of what shows, and stacks by it", () => {
		const { layout, scene } = solved([
			{
				type: "StackH",
				id: "row",
				props: { spacing: 10 },
				children: [
					clip("c", [
						rect("s", { width: 30, height: 10 }),
						rect("x", { width: 500, height: 10 }),
					]),
					rect("next"),
				],
			},
		]);
		expect(checkSolution(scene, layout)).toEqual([]);
		expect(layout.c.width).toBeCloseTo(30, 4);
		expect(layout.c.height).toBeCloseTo(10, 4);
		expect(layout.next.x).toBeCloseTo(40, 4);
	});
});

describe("Clip and Mask in the document", () => {
	const window = rect("window", { width: 100, height: 50 });

	it("draws the shape in a mask and the content in one group that names it", () => {
		const ast = astOf([
			rect("under"),
			clip("c", [window, rect("a"), rect("b")]),
		]);
		expect(ast.defs).toHaveLength(1);
		const [mask] = ast.defs ?? [];
		expect(mask).toMatchObject({ type: "mask", by: "luminance" });
		expect(mask.id).toMatch(/^ms\w+-m0$/);
		expect(mask.children).toMatchObject([
			{ type: "rect", id: "window", fill: "white", stroke: "none", width: 100 },
		]);
		expect(ast.children.map((el) => el.id)).toEqual(["under", "c"]);
		expect(ast.children[1]).toMatchObject({
			type: "g",
			attrs: { mask: `url(#${mask.id})` },
		});
		expect(ids([ast.children[1]])).toEqual(["a", "b"]);
		// No larger than where the shape is
		expect(mask.width).toBeLessThan(110);
	});

	it("puts a white backdrop under a black shape when inverse", () => {
		const ast = astOf([clip("c", [window, rect("a")], { inverse: true })]);
		const [mask] = ast.defs ?? [];
		expect(mask.children).toMatchObject([
			{ type: "rect", id: `${mask.id}-bg`, fill: "white", x: mask.x },
			{ type: "rect", id: "window", fill: "black" },
		]);
	});

	it("blurs the matte by its feather", () => {
		const ast = astOf([clip("c", [window, rect("a")], { feather: 6 })]);
		expect(ast.defs?.[0].children).toMatchObject([
			{
				type: "g",
				attrs: { filter: "blur(6px)" },
				children: [{ id: "window" }],
			},
		]);
	});

	it("keeps a Mask's paint and says how it is read", () => {
		const shape = rect("s", { fill: "rgba(0,0,0,0.5)" });
		const alpha = astOf([clip("m", [shape, rect("a")], {}, "Mask")]);
		expect(alpha.defs?.[0]).toMatchObject({
			by: "alpha",
			children: [{ fill: "rgba(0,0,0,0.5)" }],
		});
		const luminance = astOf([
			clip("m", [shape, rect("a")], { by: "luminance" }, "Mask"),
		]);
		expect(luminance.defs?.[0].by).toBe("luminance");
		const { scene, layout } = solved([
			clip("m", [shape, rect("a")], {}, "Mask"),
		]);
		const svg = layoutToSvg(layout, scene.nodes);
		expect(svg).toMatch(
			/<svg[^>]*><defs><mask id="ms\w+-m0" maskUnits="userSpaceOnUse" x="0" y="0" width="40" height="20" mask-type="alpha"><rect id="s"/,
		);
		expect(
			layoutToSvg(
				solved([clip("c", [shape, rect("a")])]).layout,
				solved([clip("c", [shape, rect("a")])]).scene.nodes,
			),
		).not.toContain("mask-type");
	});

	it("paints the group where the clip stands, sorting zOrder inside and out", () => {
		const ast = astOf([
			rect("below"),
			clip(
				"c",
				[
					window,
					rect("top", { zOrder: 2 }),
					rect("mid"),
					rect("low", { zOrder: -1 }),
				],
				{ zOrder: 1 },
			),
			rect("above"),
			rect("last", { zOrder: 5 }),
			rect("first", { zOrder: -5 }),
		]);
		expect(ast.children.map((el) => el.id)).toEqual([
			"first",
			"below",
			"above",
			"c",
			"last",
		]);
		expect(ids([groupOf(ast.children, "c")])).toEqual(["low", "mid", "top"]);
	});

	it("nests clips, each with a matte of its own", () => {
		const ast = astOf([
			clip("outer", [
				window,
				rect("a"),
				clip("inner", [rect("hole"), rect("b")]),
				rect("c"),
			]),
		]);
		expect(ast.defs?.map((m) => ids(m.children))).toEqual([
			["window"],
			["hole"],
		]);
		const outer = groupOf(ast.children, "outer");
		expect(outer.children.map((el) => el.id)).toEqual(["a", "inner", "c"]);
		expect(outer.attrs?.mask).toBe(`url(#${ast.defs?.[0].id})`);
		expect(groupOf(ast.children, "inner").attrs?.mask).toBe(
			`url(#${ast.defs?.[1].id})`,
		);
	});

	it("draws a ref'd shape only in the matte", () => {
		const ast = astOf([
			rect("s"),
			rect("other"),
			clip("c", [ref("s"), rect("a")]),
		]);
		expect(ast.children.map((el) => el.id)).toEqual(["other", "c"]);
		expect(ids(ast.defs?.[0].children ?? [])).toEqual(["s"]);
	});

	it("does not let a color relation repaint a Clip's shape", () => {
		const ast = astOf([
			rect("source", { fill: "#ff0000" }),
			clip("c", [window, rect("a")]),
			{ type: "SameColor", children: [ref("source"), ref("window")] },
		]);
		expect(ast.defs?.[0].children[0]).toMatchObject({ fill: "white" });
	});

	it("sizes the canvas by what shows: not the shape, and content only inside", () => {
		const { scene, layout } = solved([
			clip("ticker", [
				rect("win", { width: 100, height: 20 }),
				rect("strip", { width: 2000, height: 20 }),
			]),
			clip("iris", [
				{ type: "Circle", id: "hole", props: { cx: 50, cy: 10, r: 400 } },
				rect("page", { width: 100, height: 40 }),
			]),
		]);
		const bounds = layoutBounds(layout, scene.nodes);
		expect(bounds).toEqual({ start: { x: 0, y: 0 }, end: { x: 100, y: 40 } });
		const nested = solved([
			clip("o", [
				rect("w", { width: 50, height: 50 }),
				clip("i", [
					rect("v", { width: 80, height: 30 }),
					rect("big", { width: 500, height: 500 }),
				]),
			]),
		]);
		expect(layoutBounds(nested.layout, nested.scene.nodes).end).toEqual({
			x: 50,
			y: 30,
		});
		const inverse = solved([
			clip("o", [rect("w", { width: 500, height: 5 }), rect("page")], {
				inverse: true,
			}),
		]);
		expect(layoutBounds(inverse.layout, inverse.scene.nodes).end).toEqual({
			x: 40,
			y: 20,
		});
	});

	it("leaves room for a feather to fade out in", () => {
		const { scene, layout } = solved([
			clip(
				"c",
				[
					rect("w", { x: 100, y: 100, width: 50, height: 50 }),
					rect("big", { width: 500, height: 500 }),
				],
				{ feather: 5 },
			),
		]);
		expect(layoutBounds(layout, scene.nodes)).toEqual({
			start: { x: 90, y: 90 },
			end: { x: 160, y: 160 },
		});
	});

	it("names mattes after their content, or as told", () => {
		const scene = [clip("c", [window, rect("a")])];
		const [a, b] = [astOf(scene), astOf(scene)];
		expect(a.defs?.[0].id).toBe(b.defs?.[0].id);
		const other = astOf([
			clip("c", [rect("window", { width: 99 }), rect("a")]),
		]);
		expect(other.defs?.[0].id).not.toBe(a.defs?.[0].id);
		const told = astOf(scene, { idPrefix: "mine-" });
		expect(told.defs?.[0].id).toBe("mine-m0");
		expect(groupOf(told.children, "c").attrs?.mask).toBe("url(#mine-m0)");
	});

	it("writes a scene without clips exactly as before", () => {
		const { scene, layout } = solved([rect("a"), rect("b", { x: 50 })]);
		expect(layoutToAst(layout, scene.nodes).defs).toBeUndefined();
		expect(layoutToSvg(layout, scene.nodes)).toBe(
			'<svg xmlns="http://www.w3.org/2000/svg" width="90" height="20"><rect id="a" x="0" y="0" width="40" height="20" fill="#888" stroke="black" stroke-width="0" /><rect id="b" x="50" y="0" width="40" height="20" fill="#888" stroke="black" stroke-width="0" /></svg>',
		);
	});
});

describe("Clip and Mask in time", () => {
	const window = rect("window", { width: 100, height: 50 });
	const motion = (id: string, target: string, to: N, props: N = {}): N => ({
		type: "Motion",
		id,
		props: { steps: [{ to, over: 1, ease: "linear" }], ...props },
		children: [ref(target)],
	});
	const shellsOf = (els: readonly SvgElement[], id: string): number => {
		const walk = (list: readonly SvgElement[], depth: number): number =>
			Math.max(
				-1,
				...list.map((el) =>
					el.id === id
						? depth
						: el.type === "g"
							? walk(el.children, el.attrs?.class ? depth + 1 : depth)
							: -1,
				),
			);
		return walk(els, 0);
	};

	it("writes a crop as an inset on the motion's shell", () => {
		const ast = astOf([
			rect("a"),
			{
				type: "Enter",
				id: "in",
				props: { from: { cropRight: 1 }, over: 1, ease: "linear" },
				children: [ref("a")],
			},
			motion("up", "a", { cropTop: 0.25, cropLeft: 0.5 }, { at: 1 }),
		]);
		expect(ast.css).toContain(
			"0%{clip-path:inset(0% 100% 0% 0%);animation-timing-function:linear}50%{clip-path:inset(0% 0% 0% 0%)}",
		);
		expect(ast.css).toContain("100%{clip-path:inset(25% 0% 0% 50%)}");
		expect(shellsOf(ast.children, "a")).toBe(2);
	});

	it("keeps a spring crop inside the box", () => {
		const ast = astOf([
			rect("a"),
			{
				type: "Enter",
				id: "in",
				props: { from: { cropRight: 1 }, over: 1, ease: "spring" },
				children: [ref("a")],
			},
		]);
		const timing =
			/clip-path:inset[^}]*animation-timing-function:(linear\([^)]*\))/.exec(
				ast.css ?? "",
			)?.[1];
		const stops = [
			...(timing ?? "").matchAll(/(-?[\d.]+)(?: [\d.]+%)?(?=,|\))/g),
		];
		expect(stops.length).toBeGreaterThan(3);
		expect(Math.max(...stops.map((m) => Number(m[1])))).toBeLessThanOrEqual(1);
	});

	it("wraps a moved Clip once, round its group, and leaves its marks alone", () => {
		const ast = astOf([
			clip("c", [window, rect("a"), rect("b")]),
			motion("slide", "c", { x: 30, opacity: 0.5 }),
		]);
		const [shell] = ast.children;
		expect(shell).toMatchObject({
			type: "g",
			children: [{ type: "g", id: "c" }],
		});
		expect((shell as GroupElement).attrs?.class).toBeDefined();
		expect(shellsOf(ast.children, "a")).toBe(1);
		expect(shellsOf(ast.children, "b")).toBe(1);
		expect(shellsOf(ast.defs?.[0].children ?? [], "window")).toBe(0);
	});

	it("moves a ref'd shape once when a motion takes it and its clip together", () => {
		const ast = astOf([
			{
				type: "Group",
				id: "both",
				children: [window, clip("c", [ref("window"), rect("a")]), rect("free")],
			},
			motion("slide", "both", { x: 30 }),
		]);
		expect(shellsOf(ast.defs?.[0].children ?? [], "window")).toBe(0);
		expect(shellsOf(ast.children, "a")).toBe(1);
		expect(shellsOf(ast.children, "free")).toBe(1);
	});

	it("moves the cut with a motion on the shape, and the content under it", () => {
		const ast = astOf([
			clip("c", [window, rect("a")]),
			motion("open", "window", { x: 30, width: 10 }),
			motion("under", "a", { x: -30 }),
		]);
		expect(shellsOf(ast.defs?.[0].children ?? [], "window")).toBe(1);
		expect(shellsOf(ast.children, "a")).toBe(1);
		expect(ast.children[0]).toMatchObject({ type: "g", id: "c" });
		expect(ast.css).toContain("width:10px");
	});

	it("still sets replaced lanes on the marks of a moved Clip", () => {
		const ast = astOf([
			clip("c", [window, rect("a")]),
			motion("both", "c", { x: 30, fill: "#ff0000" }),
		]);
		const a = flat(ast.children).find((el) => el.id === "a");
		expect(a?.attrs?.class).toBeDefined();
		expect(ast.css).toContain("fill:#ff0000");
		// The shape of a Clip is cut by geometry: no paint lane for it
		expect(ast.defs?.[0].children[0].attrs?.class).toBeUndefined();
	});

	it("drops a paint lane on a Clip's shape and keeps it on a Mask's", () => {
		const paint = (type: string) =>
			astOf([
				clip("c", [window, rect("a")], {}, type),
				motion("tint", "window", { fill: "#ff0000" }),
			]);
		expect(paint("Clip").css ?? "").not.toContain("fill:");
		expect(paint("Mask").css).toContain("fill:#ff0000");
	});

	it("lets a Modulate resize the window and move content under it", () => {
		const { scene, layout } = solved([
			rect("wide", { width: 300, height: 10, y: 100 }),
			clip("c", [window, rect("a")]),
			{
				type: "Modulate",
				id: "grow",
				props: { at: 0, over: 1 },
				children: [{ type: "Span", children: [ref("wide"), ref("window")] }],
			},
		]);
		expect(checkSolution(scene, layout)).toEqual([]);
		expect(layout.window.phases?.grow.width).toBeCloseTo(300, 4);
		const ast = layoutToAst(layout, scene.nodes);
		expect(ast.css).toContain("width:300px");
		expect(shellsOf(ast.defs?.[0].children ?? [], "window")).toBe(0);
	});
});

describe("a matte's region", () => {
	const room = rect("room", { width: 400, height: 200, fill: "none" });
	const win = rect("win", { x: 190, y: 112, width: 20, height: 4 });
	const content = rect("in", { x: 185, y: 110, width: 30, height: 8 });
	const inside = clip("c", [win, content]);
	const outside = clip("c", [win, content], { inverse: true });
	type Box = { x: number; y: number; width: number; height: number };
	const regionOf = (
		children: N[],
		opts: Parameters<typeof layoutToAst>[3] = {},
	): Box => {
		const [{ x, y, width, height }] = astOf(children, opts).defs ?? [];
		return { x, y, width, height };
	};
	const canvas = { x: 0, y: 0, width: 400, height: 200 };
	const holds = (outer: Box, inner: Box, slack = Infinity) => {
		const sides = [
			inner.x - outer.x,
			inner.y - outer.y,
			outer.x + outer.width - inner.x - inner.width,
			outer.y + outer.height - inner.y - inner.height,
		];
		expect(Math.min(...sides)).toBeGreaterThanOrEqual(0);
		expect(Math.max(...sides)).toBeLessThanOrEqual(slack);
	};
	const move = (target: string, props: N, type = "Motion"): N => ({
		type,
		id: "move",
		props,
		children: [ref(target)],
	});
	const to = (values: N, from?: N): N => ({
		...(from ? { from } : {}),
		steps: [{ to: values, over: 1 }],
	});

	it("is the shape's own box, with a little room, when the shape stays put", () => {
		holds(regionOf([room, inside]), win.props as Box, 4);
		// A soft edge fades over more than its feather
		const soft = regionOf([room, clip("c", [win, content], { feather: 5 })]);
		holds(soft, { x: 180, y: 102, width: 40, height: 24 }, 12);
	});

	it("holds wherever a motion or a Modulate takes the shape", () => {
		const slid = regionOf([room, inside, move("win", to({ x: 100, y: -50 }))]);
		holds(slid, { x: 190, y: 62, width: 120, height: 54 }, 4);
		const sprung = regionOf([
			room,
			inside,
			move("win", { ...to({ x: 100 }), ease: "spring" }),
		]);
		holds(sprung, { x: 190, y: 112, width: 120, height: 4 }, 4);
		const wiped = regionOf([
			room,
			inside,
			move("win", to({ width: 150 }, { width: 0 })),
		]);
		holds(wiped, { x: 190, y: 112, width: 150, height: 4 }, 4);
		const grown = regionOf([room, inside, move("win", to({ scale: 3 }))]);
		holds(grown, { x: 170, y: 108, width: 60, height: 12 }, 4);
		const turned = regionOf([room, inside, move("win", to({ rotate: 90 }))]);
		holds(turned, { x: 190, y: 104, width: 20, height: 20 }, 4);
		const spanned = regionOf([
			rect("wide", { width: 300, height: 10, y: 150 }),
			room,
			inside,
			{
				type: "Modulate",
				id: "grow",
				props: { at: 0, over: 1 },
				children: [{ type: "Span", children: [ref("wide"), ref("win")] }],
			},
		]);
		holds(spanned, { x: 0, y: 112, width: 300, height: 4 }, 200);
		expect(spanned.height).toBeLessThan(60);
	});

	it("is cut to what the picture shows", () => {
		const iris = regionOf([room, inside, move("win", to({ scale: 60 }))]);
		expect(iris).toEqual(canvas);
	});

	it("is not cut when the clip itself is moved, which brings other parts into view", () => {
		const slide = { ...move("win", to({ x: -300 })), id: "slide" };
		// Cut to the canvas while the clip stays where it is
		expect(regionOf([room, inside, slide]).x).toBe(0);
		const carried = regionOf([room, inside, slide, move("c", to({ x: 300 }))]);
		holds(carried, { x: -110, y: 112, width: 320, height: 4 }, 4);
	});

	it("is all the picture shows for a shape whose box says little: text, a path, a connector", () => {
		const text: N = { type: "Text", id: "t", props: { text: "CUT", x: 10 } };
		expect(regionOf([room, clip("c", [text, content])])).toEqual(canvas);
	});

	it("is all the picture shows for an inverse clip", () => {
		expect(regionOf([room, outside])).toEqual(canvas);
	});

	it("holds what a viewport of another shape shows round the canvas", () => {
		const region = regionOf([room, outside], {
			view: { width: 400, height: 800 },
		});
		expect(region).toEqual({ x: 0, y: -300, width: 400, height: 800 });
	});

	it("holds every view of a camera and no more", () => {
		const camera = (props: N, ...targets: string[]): N => ({
			type: "Camera",
			id: "cam",
			props,
			children: targets.map(ref),
		});
		// Zoomed in: nothing shows beyond the canvas
		expect(
			regionOf([
				room,
				outside,
				camera({ at: 0.3, over: 0.5, padding: 14 }, "in"),
			]),
		).toEqual(canvas);
		// Padding takes the view past the canvas's edge
		const corner = rect("corner", { x: 0, y: 0, width: 10, height: 10 });
		const wide = regionOf([
			room,
			corner,
			outside,
			camera({ at: 0.3, over: 0.5, padding: 20 }, "corner"),
		]);
		expect(wide.x).toBeLessThanOrEqual(-20);
		expect(wide.y).toBeLessThanOrEqual(-10);
		expect(wide.x).toBeGreaterThan(-60);
		expect(wide.width).toBeLessThan(470);
	});

	it("grows by what a motion on the camera shows past the view", () => {
		const camera: N = {
			type: "Camera",
			id: "cam",
			props: { at: 0, over: 0 },
		};
		const on = (type: string, props: N): N => ({
			type,
			id: "move",
			props: { at: 0.2, over: 0.4, ...props },
			children: [ref("cam")],
		});
		const shaken = regionOf([
			room,
			outside,
			camera,
			on("Shake", { amplitude: { x: 12 } }),
		]);
		expect(shaken.x).toBeLessThanOrEqual(-9);
		expect(shaken.x + shaken.width).toBeGreaterThanOrEqual(409);
		expect(shaken.width).toBeLessThan(440);
		expect(shaken.height).toBe(200);
		// Pulled back to half size, the viewport shows twice as much
		const pulled = regionOf([
			room,
			outside,
			camera,
			on("Motion", { steps: [{ to: { scale: 0.5 }, over: 0.4 }] }),
		]);
		expect(pulled.x).toBeLessThanOrEqual(-200);
		expect(pulled.y).toBeLessThanOrEqual(-100);
		expect(pulled.width).toBeGreaterThanOrEqual(800);
		expect(pulled.width).toBeLessThan(900);
	});
});
