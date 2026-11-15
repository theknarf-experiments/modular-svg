import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { AnimationOptions } from "./animation.ts";
import {
	type CameraStep,
	everything,
	type Framing,
	fitView,
	mixViews,
	type Stage,
	stageOf,
	type ViewOptions,
	viewAt,
	viewKeys,
	viewTransform,
} from "./camera.ts";
import { type Ease, easeAt, keysOf, resolveEase, sampleAt } from "./motion.ts";
import { serializeToSvg } from "./output.ts";
import { buildSceneFromJson, checkSolution } from "./parser.ts";
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
const box = (id: string, x: number, y: number, props = {}): N => ({
	type: "Rect",
	id,
	props: { x, y, width: 20, height: 10, "stroke-width": 0, ...props },
});
const camera = (id: string, props = {}, ...targets: string[]): N => ({
	type: "Camera",
	id,
	props,
	children: targets.map(ref),
});

const render = (
	children: N[],
	opts: { animation?: AnimationOptions | false; view?: ViewOptions } = {},
) => {
	const scene = buildSceneFromJson({ type: "Group", id: "root", children });
	const layout = solveLayout(scene);
	const ast = layoutToAst(layout, scene.nodes, 0, opts);
	const warnings = [...scene.warnings, ...checkSolution(scene, layout)];
	return { ast, svg: serializeToSvg(ast), warnings };
};

type Shown = { x: number; y: number; scale: number };
/** The camera's transform at t, read off the keyframes the browser gets. */
const shownAt = (ast: ReturnType<typeof render>["ast"], t: number): Shown => {
	const group = serializeToSvg(ast).match(
		/<g data-camera="" class="\S+ (\S+)"/,
	);
	const name = ast.css?.match(
		new RegExp(`\\.${group?.[1]}\\{animation-name:([^;}]+)`),
	)?.[1];
	const body = ast.css?.match(
		new RegExp(`@keyframes ${name}\\{(.*)\\}\\n`),
	)?.[1];
	const keys = [
		...(body ?? "").matchAll(
			/([\d.]+)%\{transform:translate\((-?[\d.]+)px,(-?[\d.]+)px\) scale\(([\d.]+)\)(;animation-timing-function:(\w+))?/g,
		),
	].map((m) => ({
		t: (Number(m[1]) / 100) * (ast.duration ?? 0),
		x: Number(m[2]),
		y: Number(m[3]),
		scale: Number(m[4]),
		held: m[6] !== "linear",
	}));
	if (keys.length === 0) throw new Error("no camera keyframes");
	const i = keys.filter((k) => k.t <= t + 1e-9).length - 1;
	const [a, b] = [keys[Math.max(i, 0)], keys[i + 1]];
	if (!b || a.held) return a;
	const u = (t - a.t) / (b.t - a.t);
	const mix = (p: number, q: number) => p + (q - p) * u;
	return { x: mix(a.x, b.x), y: mix(a.y, b.y), scale: mix(a.scale, b.scale) };
};
/** The canvas point at the middle of the viewport, and the zoom. */
const lookingAt = (ast: ReturnType<typeof render>["ast"], t: number) => {
	const { x, y, scale } = shownAt(ast, t);
	return {
		x: (ast.width / 2 - x) / scale,
		y: (ast.height / 2 - y) / scale,
		scale,
	};
};

const stage: Stage = {
	home: { width: 400, height: 200 },
	width: 400,
	height: 200,
};

describe("the viewport", () => {
	it("is the canvas unless a view says otherwise", () => {
		const canvas = { width: 300, height: 100 };
		expect(stageOf(canvas)).toEqual({ home: canvas, ...canvas });
		expect(stageOf(canvas, { width: 640, height: 360 })).toMatchObject({
			width: 640,
			height: 360,
		});
		expect(stageOf(canvas, { width: 640, aspect: 16 / 9 }).height).toBe(360);
		expect(stageOf(canvas, { height: 360, aspect: 16 / 9 }).width).toBe(640);
		expect(stageOf(canvas, { width: 600 }).height).toBe(200);
		// The smallest 1:1 and 6:1 rects that hold a 3:1 canvas
		expect(stageOf(canvas, { aspect: 1 })).toMatchObject({
			width: 300,
			height: 300,
		});
		expect(stageOf(canvas, { aspect: 6 })).toMatchObject({
			width: 600,
			height: 100,
		});
	});

	it("refuses a size that is not above 0", () => {
		expect(() => stageOf({ width: 1, height: 1 }, { width: 0 })).toThrow(
			"view.width must be above 0",
		);
		expect(() => stageOf({ width: 1, height: 1 }, { aspect: -1 })).toThrow(
			"view.aspect must be above 0",
		);
	});
});

describe("fitView", () => {
	const wide = { x: 100, y: 50, width: 100, height: 10 };
	const tall = { x: 100, y: 50, width: 10, height: 100 };

	it("contains the whole box, centred, at the viewport's aspect", () => {
		expect(fitView(wide, 0, "contain", stage)).toEqual({
			x: 100,
			y: 30,
			width: 100,
			height: 50,
		});
		expect(fitView(tall, 0, "contain", stage)).toEqual({
			x: 5,
			y: 50,
			width: 200,
			height: 100,
		});
	});

	it("covers the viewport with the box, cropping the long side", () => {
		expect(fitView(wide, 0, "cover", stage)).toMatchObject({
			width: 20,
			height: 10,
		});
		expect(fitView(tall, 0, "cover", stage)).toMatchObject({
			width: 10,
			height: 5,
		});
	});

	it("grows the box by its padding", () => {
		expect(fitView(wide, 10, "contain", stage)).toEqual({
			x: 90,
			y: 25,
			width: 120,
			height: 60,
		});
	});

	it("contains a box with one side when asked to cover it", () => {
		const line = { x: 0, y: 0, width: 100, height: 0 };
		expect(fitView(line, 0, "cover", stage)).toEqual(
			fitView(line, 0, "contain", stage),
		);
	});

	it("has no view of a box with no extent", () => {
		const point = { x: 5, y: 5, width: 0, height: 0 };
		expect(fitView(point, 0, "contain", stage)).toBeUndefined();
		expect(fitView(point, 4, "contain", stage)).toMatchObject({ width: 16 });
	});
});

describe("mixViews", () => {
	const a = { x: 0, y: 0, width: 400, height: 200 };
	const b = { x: 300, y: 150, width: 50, height: 25 };

	it("is exact at both ends", () => {
		expect(mixViews(a, b, 0)).toEqual(a);
		expect(mixViews(a, b, 1)).toEqual(b);
	});

	it("pans in a straight line at an even pace", () => {
		const to = { ...a, x: 100, y: 40 };
		expect(mixViews(a, to, 0.25)).toEqual({ ...a, x: 25, y: 10 });
	});

	it("zooms geometrically: halfway is the geometric mean", () => {
		const half = mixViews(a, b, 0.5);
		expect(half.width).toBeCloseTo(Math.sqrt(400 * 50), 9);
		// Still on the straight line between the two rects
		const q = (half.width - a.width) / (b.width - a.width);
		expect(half.x).toBeCloseTo(b.x * q, 9);
		expect(half.y).toBeCloseTo(b.y * q, 9);
	});

	it("stays finite when an ease overshoots", () => {
		for (const p of [-0.3, 1.4]) {
			const view = mixViews(a, b, p);
			expect(Object.values(view).every(Number.isFinite)).toBe(true);
			expect(view.width).toBeGreaterThan(0);
		}
	});

	it("lies on the segment between the two, its zoom monotone", () => {
		const rect = fc.record({
			x: fc.double({ min: -500, max: 500, noNaN: true }),
			y: fc.double({ min: -500, max: 500, noNaN: true }),
			width: fc.double({ min: 1, max: 2000, noNaN: true }),
		});
		fc.assert(
			fc.property(
				rect,
				rect,
				fc.double({ min: 0, max: 1, noNaN: true }),
				fc.double({ min: 0, max: 1, noNaN: true }),
				(ra, rb, p1, p2) => {
					const [va, vb] = [ra, rb].map((r) => ({ ...r, height: r.width / 2 }));
					const [lo, hi] = [Math.min(p1, p2), Math.max(p1, p2)];
					const [m1, m2] = [mixViews(va, vb, lo), mixViews(va, vb, hi)];
					const q =
						vb.width === va.width
							? lo
							: (m1.width - va.width) / (vb.width - va.width);
					expect(q).toBeGreaterThanOrEqual(-1e-9);
					expect(q).toBeLessThanOrEqual(1 + 1e-9);
					expect(m1.x).toBeCloseTo(va.x + (vb.x - va.x) * q, 6);
					expect(m1.y).toBeCloseTo(va.y + (vb.y - va.y) * q, 6);
					const grows = vb.width >= va.width;
					expect(
						(m2.width - m1.width) * (grows ? 1 : -1),
					).toBeGreaterThanOrEqual(-1e-9);
				},
			),
		);
	});
});

/** The farthest a corner of the exact view lands from the viewport's, over the timeline. */
const worstMiss = (
	steps: readonly CameraStep[],
	framings: readonly Framing[],
	period: number,
	count = 2000,
): number => {
	const moved = viewKeys(steps, framings, stage, period);
	const keys = keysOf(moved.initial, moved.steps, period);
	// A cut is one nudge wide in the keys: not a place to measure
	const cuts = steps.flatMap((s) =>
		s.ease.kind === "steps" && s.over > 0
			? Array.from(
					{ length: s.ease.count + 1 },
					(_, j) =>
						s.start +
						(s.over * j) / (s.ease.kind === "steps" ? s.ease.count : 1),
				)
			: [s.start],
	);
	let worst = 0;
	for (let i = 0; i <= count; i++) {
		const t = (i / count) * period;
		if (cuts.some((c) => Math.abs(t - c) < 1e-3)) continue;
		const exact = viewAt(steps, framings, stage, t);
		const got = sampleAt(keys, t);
		const [x, y, k] = [Number(got.x), Number(got.y), Number(got.scale)];
		worst = Math.max(
			worst,
			Math.hypot(exact.x * k + x, exact.y * k + y),
			Math.hypot(
				(exact.x + exact.width) * k + x - stage.width,
				(exact.y + exact.height) * k + y - stage.height,
			),
		);
	}
	return worst;
};
const fixedAt = (x: number, y: number, width: number): Framing => ({
	at: () => ({ x, y, width, height: width / 2 }),
	breaks: [],
});

describe("viewKeys", () => {
	it("stays within half a pixel of the exact view", () => {
		const eases = ["linear", "inOut", "out", "spring", "steps(3)"] as const;
		const target = fc.record({
			x: fc.integer({ min: 0, max: 300 }),
			y: fc.integer({ min: 0, max: 150 }),
			width: fc.integer({ min: 100, max: 400 }),
			start: fc.integer({ min: 0, max: 8 }),
			over: fc.integer({ min: 0, max: 4 }),
			ease: fc.constantFrom(...eases),
			drift: fc.integer({ min: -40, max: 40 }),
		});
		fc.assert(
			fc.property(
				fc.array(target, { minLength: 1, maxLength: 4 }),
				(targets) => {
					const period = 10;
					const sorted = [...targets].sort((a, b) => a.start - b.start);
					const steps: CameraStep[] = sorted.map((s, i) => ({
						start: s.start,
						over: Math.min(
							s.over / 2,
							(sorted[i + 1]?.start ?? period) - s.start,
						),
						ease: resolveEase(s.ease),
						framing: i,
					}));
					// A framing that drifts across the scene, as a followed mark does
					const framings: Framing[] = sorted.map((s) => ({
						at: (t) => ({
							x: s.x + (s.drift * t) / period,
							y: s.y,
							width: s.width,
							height: s.width / 2,
						}),
						breaks: [],
					}));
					expect(worstMiss(steps, framings, period, 700)).toBeLessThan(0.5);
				},
			),
			{ numRuns: 200 },
		);
	});

	it("holds that through the fast start of an eased move", () => {
		const out = resolveEase("out");
		const cut = { start: 0, over: 0, ease: resolveEase("linear"), framing: 0 };
		// A cut in, then a pull-out; a pan; a slow pull-out
		expect(
			worstMiss(
				[cut, { start: 0, over: 3, ease: out, framing: 1 }],
				[fixedAt(0, 0, 100), fixedAt(0, 0, 176)],
				10,
			),
		).toBeLessThan(0.5);
		expect(
			worstMiss(
				[cut, { start: 2, over: 0.5, ease: out, framing: 1 }],
				[fixedAt(0, 0, 100), fixedAt(300, 100, 100)],
				10,
			),
		).toBeLessThan(0.5);
		expect(
			worstMiss(
				[cut, { start: 2, over: 1.5, ease: out, framing: 1 }],
				[fixedAt(0, 0, 100), fixedAt(0, 0, 400)],
				10,
			),
		).toBeLessThan(0.5);
	});
});

const a = box("a", 0, 0);
const b = box("b", 180, 90);

describe("a scene seen through a viewport", () => {
	it("is written as before when it has no camera and no view", () => {
		const { ast, svg } = render([a, b]);
		expect(ast.viewBox).toBeUndefined();
		expect(svg).toBe(
			'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect id="a" x="0" y="0" width="20" height="10" fill="none" stroke="black" stroke-width="0" /><rect id="b" x="180" y="90" width="20" height="10" fill="none" stroke="black" stroke-width="0" /></svg>',
		);
	});

	it("fits the canvas into a view, with no animation", () => {
		const { ast, svg } = render([a, b], { view: { width: 400, height: 400 } });
		expect(ast).toMatchObject({ width: 400, height: 400 });
		expect(ast.css).toBeUndefined();
		expect(svg).toContain('width="400" height="400" viewBox="0 0 400 400"');
		expect(svg).toContain(
			'<g data-camera="" transform="translate(0,100) scale(2)"><rect id="a"',
		);
	});

	it("leaves the transform out when the view is the canvas", () => {
		const { svg } = render([a, b], { view: { width: 200 } });
		expect(svg).toContain('viewBox="0 0 200 100"><g data-camera=""><rect');
	});

	it("shows the default view when animation is off", () => {
		const { ast, svg } = render([a, b, camera("on", { at: 0 }, "b")], {
			animation: false,
		});
		expect(ast.css).toBeUndefined();
		expect(svg).toContain('viewBox="0 0 200 100"><g data-camera=""><rect');
	});
});

describe("Camera", () => {
	it("opens on what it frames when it cuts at 0", () => {
		const { ast, svg } = render([a, b, camera("on", { at: 0, over: 0 }, "b")]);
		expect(svg).toMatch(/<g data-camera="" class="ms\w+-a ms\w+-c0">/);
		expect(ast.css).toContain("transform-origin:0 0");
		expect(ast.css).toContain(
			"0%{transform:translate(-1800px,-900px) scale(10)}",
		);
		expect(lookingAt(ast, 0.5)).toEqual({ x: 190, y: 95, scale: 10 });
	});

	it("frames with padding, and covers when asked", () => {
		const padded = render([
			a,
			b,
			camera("on", { at: 0, over: 0, padding: 10 }, "b"),
		]);
		// 40 by 30 with its padding, in a 2:1 viewport
		expect(lookingAt(padded.ast, 0).scale).toBeCloseTo(200 / 60, 5);
		const tall = box("t", 100, 0, { width: 10, height: 100 });
		const covered = render([
			a,
			b,
			tall,
			camera("on", { at: 0, over: 0, fit: "cover" }, "t"),
		]);
		expect(lookingAt(covered.ast, 0)).toMatchObject({
			x: 105,
			y: 50,
			scale: 20,
		});
	});

	it("moves there over its span, zooming at an even pace", () => {
		const { ast } = render([
			a,
			b,
			camera("on", { at: 1, over: 2, ease: "linear" }, "b"),
		]);
		expect(ast.duration).toBe(3);
		expect(lookingAt(ast, 0.5)).toEqual({ x: 100, y: 50, scale: 1 });
		const half = lookingAt(ast, 2);
		expect(half.scale).toBeCloseTo(Math.sqrt(10), 1);
		// The view rect is on the straight line between the two framings
		const q = (200 / half.scale - 200) / (20 - 200);
		expect(half.x).toBeCloseTo(100 + 90 * q, 0);
		expect(half.y).toBeCloseTo(50 + 45 * q, 0);
		expect(lookingAt(ast, 3)).toEqual({ x: 190, y: 95, scale: 10 });
	});

	it("gives the view to whichever camera started last", () => {
		const { ast, warnings } = render([
			a,
			b,
			camera("onB", { at: 2, over: 0 }, "b"),
			camera("onA", { at: 1, over: 0 }, "a"),
		]);
		expect(warnings).toEqual([]);
		expect(lookingAt(ast, 1.5)).toMatchObject({ x: 10, y: 5 });
		expect(lookingAt(ast, 2)).toMatchObject({ x: 190, y: 95 });
	});

	it("cuts a camera short when the next starts before it settled", () => {
		const { ast, warnings } = render([
			a,
			b,
			camera("onA", { at: 0, over: 2, ease: "linear" }, "a"),
			camera("onB", { at: 1, over: 1, ease: "linear" }, "b"),
		]);
		expect(warnings).toEqual([
			"Camera(onB) starts while Camera(onA) is still settling; onA is cut short",
		]);
		// onA arrives by the time onB starts
		expect(lookingAt(ast, 1)).toEqual({ x: 10, y: 5, scale: 10 });
		expect(lookingAt(ast, 2)).toEqual({ x: 190, y: 95, scale: 10 });
	});

	it("frames what a relation it refs relates", () => {
		const { ast, warnings } = render([
			a,
			b,
			box("c", 100, 0),
			{ type: "Group", id: "pair", children: [ref("a"), ref("c")] },
			camera("on", { at: 0, over: 0 }, "pair"),
		]);
		expect(warnings).toEqual([]);
		expect(lookingAt(ast, 0).x).toBeCloseTo(60, 3);
		expect(lookingAt(ast, 0).y).toBeCloseTo(5, 3);
	});

	it("pulls back to everything when it refs nothing", () => {
		const { ast, warnings } = render([
			a,
			b,
			camera("on", { at: 0, over: 0 }, "b"),
			camera("wide", { at: 1, over: 1 }),
		]);
		expect(warnings).toEqual([]);
		expect(lookingAt(ast, 2)).toEqual({ x: 100, y: 50, scale: 1 });
	});

	it("re-frames a box as a Modulate moves it, over the Modulate's span", () => {
		const { ast } = render([
			{
				type: "StackH",
				id: "row",
				props: { spacing: 60 },
				children: [box("p", 0, 0), box("q", 0, 0), box("r", 0, 0)],
			},
			camera("on", { at: 0, over: 0 }, "p"),
			{
				type: "Modulate",
				id: "m",
				props: { at: 1, over: 1, ease: "linear" },
				children: [
					{
						type: "StackH",
						id: "o",
						props: { spacing: 60 },
						children: ["q", "r", "p"].map(ref),
					},
				],
			},
		]);
		expect(lookingAt(ast, 0.5).x).toBeCloseTo(10, 3);
		// The stack keeps q where it is, so p ends 240 to the right
		expect(lookingAt(ast, 1.5).x).toBeCloseTo(130, 3);
		expect(lookingAt(ast, 2).x).toBeCloseTo(250, 3);
	});

	const trip: N = {
		type: "Travel",
		id: "trip",
		props: { at: 1, over: 2, ease: "linear" },
		children: [ref("a"), ref("b")],
	};

	it("follows a travelling mark only when told to", () => {
		const followed = render([
			a,
			b,
			trip,
			camera("on", { at: 0, over: 0, follow: true, padding: 20 }, "a"),
		]);
		expect(lookingAt(followed.ast, 0.5)).toMatchObject({ x: 10, y: 5 });
		const mid = lookingAt(followed.ast, 2);
		expect(mid.x).toBeCloseTo(100, 3);
		expect(mid.y).toBeCloseTo(50, 3);
		expect(lookingAt(followed.ast, 3)).toMatchObject({ x: 190, y: 95 });

		const fixed = render([
			a,
			b,
			trip,
			camera("on", { at: 0, over: 0, padding: 20 }, "a"),
		]);
		expect(lookingAt(fixed.ast, 2)).toMatchObject({ x: 10, y: 5 });
	});

	it("follows a mark round a curved route", () => {
		const c = box("c", 180, 0);
		const { ast } = render([
			a,
			b,
			c,
			{
				type: "Travel",
				id: "trip",
				props: { at: 0, over: 2, ease: "linear", route: "smooth" },
				children: [ref("a"), ref("c"), ref("b")],
			},
			camera("on", { at: 0, over: 0, follow: true, padding: 20 }, "a"),
		]);
		// Past the first waypoint, on the curve rather than at either end
		const turn = lookingAt(ast, 1);
		expect(turn.x).toBeGreaterThan(130);
		expect(turn.y).toBeLessThan(30);
		expect(lookingAt(ast, 2)).toMatchObject({ x: 190, y: 95 });
	});

	/** How far the middle of the viewport is from a point that moves, at its worst. */
	const strays = (
		ast: ReturnType<typeof render>["ast"],
		at: (t: number) => { x: number; y: number },
		[from, to]: readonly [number, number],
	): number => {
		let worst = 0;
		for (let i = 0; i <= 600; i++) {
			const t = from + ((to - from) * i) / 600;
			const [seen, p] = [lookingAt(ast, t), at(t)];
			worst = Math.max(
				worst,
				Math.hypot(seen.x - p.x, seen.y - p.y) * seen.scale,
			);
		}
		return worst;
	};

	it("keeps a followed mark in the middle while an ease moves it", () => {
		for (const ease of ["inOut", "out", "spring", "bounce", "elastic"]) {
			const { ast } = render([
				a,
				box("far", 300, 100),
				box("m", 200, 0),
				{
					type: "Enter",
					id: "slide",
					props: { at: 1, over: 1, from: { x: -200 }, ease },
					children: [ref("m")],
				},
				camera("on", { at: 0, over: 0, follow: true, padding: 10 }, "m"),
			]);
			const shape = resolveEase(ease as Ease);
			const stray = strays(
				ast,
				(t) => ({ x: 210 - 200 * (1 - easeAt(shape, t - 1)), y: 5 }),
				[0.9, 2.1],
			);
			expect(stray, ease).toBeLessThan(0.5);
		}
	});

	it("keeps a mark in the middle while a Modulate moves it on a spring", () => {
		for (const ease of ["inOut", "spring", "elastic"]) {
			const { ast } = render([
				{
					type: "StackH",
					id: "row",
					props: { spacing: 10 },
					children: [box("p", 0, 0), box("q", 0, 0), box("m", 0, 0)],
				},
				{
					type: "Modulate",
					id: "spread",
					props: { at: 1, over: 1, ease },
					children: [
						{
							type: "StackH",
							props: { spacing: 100 },
							children: [ref("p"), ref("q"), ref("m")],
						},
					],
				},
				camera("on", { at: 0, over: 0, padding: 10 }, "m"),
			]);
			const shape = resolveEase(ease as Ease);
			const stray = strays(
				ast,
				(t) => ({ x: 70 + 180 * easeAt(shape, t - 1), y: 5 }),
				[0.9, 2.1],
			);
			expect(stray, ease).toBeLessThan(0.5);
		}
	});

	it("is placed in time by Sequence and OnBeat like any timed leaf", () => {
		const sequenced = render([
			a,
			b,
			camera("onA", { over: 1, ease: "linear" }, "a"),
			camera("onB", { over: 1, ease: "linear" }, "b"),
			{
				type: "Sequence",
				children: [
					ref("onA"),
					{ type: "Rest", id: "hold", props: { over: 1 } },
					ref("onB"),
				],
			},
		]);
		expect(sequenced.warnings).toEqual([]);
		expect(sequenced.ast.duration).toBe(3);
		expect(lookingAt(sequenced.ast, 2)).toEqual({ x: 10, y: 5, scale: 10 });
		expect(lookingAt(sequenced.ast, 3)).toEqual({ x: 190, y: 95, scale: 10 });

		const onBeat = render([
			a,
			b,
			{ type: "Beat", id: "beat", props: { period: 2, offset: 1 } },
			camera("onB", { over: 0 }, "b"),
			{ type: "OnBeat", children: [ref("beat"), ref("onB")] },
		]);
		expect(onBeat.warnings).toEqual([]);
		expect(lookingAt(onBeat.ast, 0.9).scale).toBe(1);
		expect(lookingAt(onBeat.ast, 1.01).scale).toBe(10);
	});

	const phrase = (props: Record<string, unknown>): N[] => [
		a,
		b,
		camera("onA", { at: 0, over: 1, ease: "linear" }, "a"),
		camera("onB", { at: 1, over: 1, ease: "linear" }, "b"),
		{
			type: "Phrase",
			id: "p",
			props,
			children: [ref("onA"), ref("onB")],
		},
	];

	it("plays at a phrase's rate", () => {
		const { ast, warnings } = render(phrase({ rate: 2 }));
		expect(warnings).toEqual([]);
		expect(ast.duration).toBe(1);
		expect(lookingAt(ast, 0.5)).toEqual({ x: 10, y: 5, scale: 10 });
		expect(lookingAt(ast, 1)).toEqual({ x: 190, y: 95, scale: 10 });
	});

	it("plays backwards in a retrograde phrase, from its last framing", () => {
		const { ast } = render(phrase({ retrograde: true, at: 1 }));
		expect(lookingAt(ast, 0.5).scale).toBe(1);
		// Cut to the last framing as the phrase starts
		expect(lookingAt(ast, 0.99).scale).toBe(1);
		expect(lookingAt(ast, 1.001).x).toBeCloseTo(190, 0);
		expect(lookingAt(ast, 1.001).scale).toBe(10);
		expect(lookingAt(ast, 2).x).toBeCloseTo(10, 1);
		expect(lookingAt(ast, 2).scale).toBe(10);
		expect(lookingAt(ast, 3)).toEqual({ x: 100, y: 50, scale: 1 });
	});

	it("starts every pass of a repeating phrase from the scene's framing", () => {
		const { ast } = render(phrase({ repeat: 2 }));
		expect(ast.duration).toBe(4);
		expect(lookingAt(ast, 1.99).scale).toBeCloseTo(10, 1);
		const again = lookingAt(ast, 2.001);
		expect(again.scale).toBeCloseTo(1, 1);
		expect(again.x).toBeCloseTo(100, 0);
		expect(lookingAt(ast, 3)).toEqual({ x: 10, y: 5, scale: 10 });
	});

	it("turns round without a cut in an alternating phrase", () => {
		const { ast } = render(phrase({ repeat: 2, alternate: true }));
		expect(lookingAt(ast, 2)).toEqual({ x: 190, y: 95, scale: 10 });
		expect(lookingAt(ast, 3)).toEqual({ x: 10, y: 5, scale: 10 });
		expect(lookingAt(ast, 4)).toEqual({ x: 100, y: 50, scale: 1 });
	});

	it("is not pulled into a phrase by framing what plays there", () => {
		const { ast, warnings } = render([
			a,
			b,
			{
				type: "Phrase",
				id: "p",
				props: { at: 1 },
				children: [
					{
						type: "Enter",
						id: "in",
						props: { over: 1 },
						children: [ref("b")],
					},
				],
			},
			camera("on", { at: 0, over: 0 }, "b"),
		]);
		expect(warnings).toEqual([]);
		expect(lookingAt(ast, 0)).toEqual({ x: 190, y: 95, scale: 10 });
	});

	it("puts the reduced-motion still on the view's track", () => {
		const { ast, svg } = render([a, b, camera("on", { at: 1, over: 1 }, "b")], {
			animation: { stillAt: 2 },
		});
		const [, shared] = svg.match(/<g data-camera="" class="(\S+) /) ?? [];
		expect(ast.css).toContain(
			`.${shared}{animation-delay:-2s!important;animation-play-state:paused!important}`,
		);
	});

	it("runs past the end of the scene only with an error", () => {
		expect(() =>
			render([a, b, camera("on", { at: 1, over: 2 }, "b")], {
				animation: { duration: 2 },
			}),
		).toThrow("on runs until 3s, past the 2s scene");
	});

	it("takes springs and stepped eases", () => {
		const sprung = render([
			a,
			b,
			camera("on", { at: 0, over: 1, ease: "spring" }, "b"),
		]);
		const scales = Array.from(
			{ length: 50 },
			(_, i) => lookingAt(sprung.ast, i / 50).scale,
		);
		expect(Math.max(...scales)).toBeGreaterThan(10.2);
		expect(lookingAt(sprung.ast, 1).scale).toBe(10);

		const stepped = render([
			a,
			b,
			camera("on", { at: 0, over: 1, ease: "steps(2)" }, "b"),
		]);
		expect(lookingAt(stepped.ast, 0.49).scale).toBe(1);
		expect(lookingAt(stepped.ast, 0.51).scale).toBeCloseTo(Math.sqrt(10), 3);
		expect(lookingAt(stepped.ast, 1).scale).toBe(10);
	});
});

describe("cameras in any scene (properties)", () => {
	const eases = ["linear", "inOut", "pop", "spring", "bounce", "steps(2)"];
	const cameraArb = fc.record({
		at: fc.option(fc.constantFrom(0, 0.5, 1, 2), { nil: undefined }),
		over: fc.constantFrom(0, 0.2, 1),
		ease: fc.constantFrom(...eases),
		padding: fc.constantFrom(0, 8, -4),
		fit: fc.constantFrom("contain", "cover"),
		follow: fc.boolean(),
		frames: fc.subarray(["a", "b", "c", "pair"]),
		phrase: fc.option(
			fc.record({
				repeat: fc.constantFrom(1, 2, 3),
				alternate: fc.boolean(),
				retrograde: fc.boolean(),
				rate: fc.constantFrom(0.5, 1, 2),
			}),
			{ nil: undefined },
		),
	});

	it("compile to finite keyframes, whatever plays around them", () => {
		fc.assert(
			fc.property(
				fc.array(cameraArb, { minLength: 1, maxLength: 4 }),
				fc.boolean(),
				fc.constantFrom(undefined, { width: 320, height: 90 }, { aspect: 1 }),
				(cameras, sequenced, view) => {
					const children: N[] = [
						a,
						b,
						box("c", 60, 40),
						{ type: "Group", id: "pair", children: [box("d", 0, 60)] },
						{
							type: "Travel",
							id: "trip",
							props: { at: 0.5, over: 1.5, route: "smooth", ease: "spring" },
							children: [ref("a"), ref("c"), ref("b")],
						},
						{
							type: "Modulate",
							id: "m",
							props: { at: 1, over: 0.5, ease: "spring" },
							children: [
								{
									type: "StackV",
									props: { spacing: 4 },
									children: [ref("b"), ref("c")],
								},
							],
						},
					];
					cameras.forEach((c, i) => {
						const node: N = {
							type: "Camera",
							id: `cam${i}`,
							props: {
								...(c.at !== undefined && !sequenced ? { at: c.at } : {}),
								over: c.over,
								ease: c.ease,
								padding: c.padding,
								fit: c.fit,
								follow: c.follow,
							},
							children: c.frames.map(ref),
						};
						children.push(
							c.phrase
								? {
										type: "Phrase",
										id: `ph${i}`,
										props: c.phrase,
										children: [node],
									}
								: node,
						);
					});
					if (sequenced)
						children.push({
							type: "Sequence",
							children: cameras.map((c, i) =>
								ref(c.phrase ? `ph${i}` : `cam${i}`),
							),
						});
					const { ast, svg } = render(children, { view });
					expect(svg).toContain("data-camera");
					const numbers = [
						...(ast.css ?? "").matchAll(
							/transform:translate\(([^)]+)\) scale\(([^)]+)\)/g,
						),
					].flatMap((m) => [...m[1].split(","), m[2]].map(Number.parseFloat));
					expect(numbers.length).toBeGreaterThan(0);
					expect(numbers.every(Number.isFinite)).toBe(true);
					// Scales stay positive: the view never turns inside out
					expect(
						numbers.filter((_, i) => i % 3 === 2).every((k) => k > 0),
					).toBe(true);
				},
			),
			{ numRuns: 150 },
		);
	});
});

describe("Camera warnings", () => {
	it("names a child that takes no space, and frames the rest", () => {
		const { warnings, ast } = render([
			a,
			b,
			{ type: "Enter", id: "in", props: { over: 1 }, children: [ref("a")] },
			camera("on", { at: 0, over: 0 }, "in", "b"),
		]);
		expect(warnings).toEqual([
			"Camera(on) frames in, which takes no space; ref a mark or a group",
		]);
		expect(lookingAt(ast, 0)).toMatchObject({ x: 190, y: 95 });
	});

	it("reads an unknown fit as contain", () => {
		const { warnings } = render([a, camera("on", { at: 0, fit: "fill" }, "a")]);
		expect(warnings).toEqual([
			'Camera(on): fit must be "contain" or "cover"; using contain',
		]);
	});

	it("says when cameras in different time both move the view", () => {
		const { warnings } = render([
			a,
			b,
			camera("wide", { at: 0, over: 0 }),
			camera("onB", { at: 0, over: 1 }, "b"),
			{ type: "Phrase", id: "p", props: { at: 1 }, children: [ref("onB")] },
		]);
		expect(warnings).toEqual([
			"Camera(wide) and Camera(onB) play in different time and both move the view; whichever started last holds it",
		]);
	});

	it("shows everything instead of an empty box", () => {
		const { warnings, ast } = render([
			a,
			b,
			{ type: "Group", id: "none", children: [] },
			camera("on", { at: 0, over: 0 }, "none"),
		]);
		expect(warnings).toEqual([
			"Camera(on) frames an empty box; showing everything instead",
		]);
		expect(lookingAt(ast, 0)).toEqual({ x: 100, y: 50, scale: 1 });
	});

	it("reads a camera inside a Modulate as if declared outside", () => {
		const { warnings } = render([
			a,
			b,
			{
				type: "Modulate",
				id: "m",
				props: { at: 0 },
				children: [camera("on", { at: 0, over: 0 }, "b")],
			},
		]);
		expect(warnings[0]).toContain(
			"Modulate(m): Camera cannot be modulated, so it is read as if declared outside",
		);
	});
});

describe("a motion on a camera", () => {
	const shake = (props = {}): N => ({
		type: "Shake",
		id: "hit",
		props: { at: 1, over: 0.5, amplitude: { x: 6 }, ...props },
		children: [ref("on")],
	});

	it("moves the view in shells round it, about the middle of the viewport", () => {
		const { svg, ast, warnings } = render([
			a,
			b,
			camera("on", { at: 0, over: 0 }, "b"),
			{
				type: "Motion",
				id: "punch",
				props: { at: 0, steps: [{ to: { scale: 1.2 }, over: 0.2 }] },
				children: [ref("on")],
			},
			shake(),
		]);
		expect(warnings).toEqual([]);
		expect(svg).toMatch(
			/<\/style><g class="[^"]+"><g class="[^"]+"><g data-camera="" class="[^"]+"><rect/,
		);
		expect(ast.css).toContain("transform-origin:100px 50px");
		expect(ast.css).toContain("translate:-5px 0px");
	});

	it("cannot animate what only a mark has", () => {
		expect(() =>
			render([
				a,
				camera("on", { at: 0, over: 0 }, "a"),
				{
					type: "Motion",
					id: "tint",
					props: { steps: [{ to: { fill: "#f00" }, over: 1 }] },
					children: [ref("on")],
				},
			]),
		).toThrow(
			"Camera(on) cannot animate fill; a motion on a camera takes x, y, scale, rotate, opacity, blur or a crop",
		);
	});
});

it("everything is the canvas, centred in a viewport of another aspect", () => {
	const tall: Stage = {
		home: { width: 200, height: 100 },
		width: 200,
		height: 400,
	};
	expect(everything(tall)).toEqual({ x: 0, y: -150, width: 200, height: 400 });
	expect(viewTransform(everything(tall), tall)).toEqual({
		x: 0,
		y: 150,
		scale: 1,
	});
});
