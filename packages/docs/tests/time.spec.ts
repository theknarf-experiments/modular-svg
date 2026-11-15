import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { expect, type Page, test } from "@playwright/test";
import {
	along,
	buildSceneFromJson,
	layoutToSvg,
	routeOf,
	smoothThrough,
	solveLayout,
} from "../../modular-svg-core/src/index.ts";

// What the browser draws, which the unit tests can only describe: the static
// SVG of a scene is put on a page and measured at chosen times.

type N = Record<string, unknown>;
const ref = (target: string): N => ({ type: "Ref", target });
const rect = (id: string, props: N = {}): N => ({
	type: "Rect",
	id,
	props: { width: 40, height: 10, "stroke-width": 0, fill: "#888", ...props },
});
const svgOf = (children: N[], loop = false): string => {
	const scene = buildSceneFromJson({ type: "Group", id: "root", children });
	return layoutToSvg(solveLayout(scene), scene.nodes, 0, {
		animation: { loop },
	});
};

/** Hold every animation on the page at `css` seconds (SMIL at `smil`). */
const seek = (page: Page, css: number, smil = css) =>
	page.evaluate(
		([c, s]) => {
			for (const a of document.getAnimations()) {
				a.pause();
				a.currentTime = c * 1000;
			}
			const svg = document.querySelector("svg") as SVGSVGElement;
			svg.pauseAnimations();
			svg.setCurrentTime(s);
		},
		[css, smil],
	);

/** Centres of the given elements, in the svg's own pixels. */
const centres = (page: Page, ids: string[]) =>
	page.evaluate((wanted) => {
		const svg = document.querySelector("svg") as SVGSVGElement;
		const origin = svg.getBoundingClientRect();
		return Object.fromEntries(
			wanted.map((id) => {
				const r = (
					svg.querySelector(`[id="${id}"]`) as Element
				).getBoundingClientRect();
				return [
					id,
					{
						x: r.x + r.width / 2 - origin.x,
						y: r.y + r.height / 2 - origin.y,
						width: r.width,
						height: r.height,
					},
				];
			}),
		);
	}, ids);

/** Where the visible path of a connector starts and ends. */
const endsOf = (page: Page, id: string) =>
	page.evaluate((wanted) => {
		const paths = [
			...document.querySelectorAll<SVGPathElement>(
				`[id="${wanted}"], [id="${wanted}-still"]`,
			),
		];
		const path =
			paths.find((p) => getComputedStyle(p).display !== "none") ?? paths[0];
		const [a, b] = [
			path.getPointAtLength(0),
			path.getPointAtLength(path.getTotalLength()),
		];
		return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
	}, id);

const list = (ids: string[]): N => ({
	type: "StackV",
	id: "list",
	props: { spacing: 8 },
	children: ids.map((id) => rect(id)),
});
const reorder: N = {
	type: "Modulate",
	id: "m",
	props: { at: 1, over: 1, ease: "linear" },
	children: [
		{
			type: "StackV",
			id: "o",
			props: { spacing: 8 },
			children: ["c", "a", "b"].map(ref),
		},
	],
};
const onList = (to: N): N => ({
	type: "Motion",
	id: "spin",
	props: { at: 2.5, steps: [{ to, over: 1, ease: "linear" }] },
	children: [ref("list")],
});

test("a reordered list turns and scales as it then looks", async ({ page }) => {
	await page.setContent(
		svgOf([list(["a", "b", "c"]), reorder, onList({ rotate: 180 })]),
	);
	await seek(page, 2.2);
	const before = await centres(page, ["a", "b", "c"]);
	const top = before.c.y;
	expect([before.a.y - top, before.b.y - top]).toEqual([18, 36]);
	await seek(page, 3.5);
	const turned = await centres(page, ["a", "b", "c"]);
	expect(turned.b.y).toBeCloseTo(top, 1);
	expect(turned.a.y).toBeCloseTo(top + 18, 1);
	expect(turned.c.y).toBeCloseTo(top + 36, 1);

	await page.setContent(
		svgOf([list(["a", "b", "c"]), reorder, onList({ scale: 2 })]),
	);
	await seek(page, 3.5);
	const scaled = await centres(page, ["a", "b", "c"]);
	expect(scaled.a.y - scaled.c.y).toBeCloseTo(36, 1);
	expect(scaled.b.y - scaled.a.y).toBeCloseTo(36, 1);
});

test("a mark a Modulate moved and resized turns about where it is", async ({
	page,
}) => {
	const bar = (id: string): N => ({
		type: "Rect",
		id,
		props: { height: 10, "stroke-width": 0, fill: "#888" },
	});
	await page.setContent(
		svgOf([
			{
				type: "StackV",
				id: "col",
				props: { spacing: 10 },
				children: [bar("a"), bar("b")],
			},
			{
				type: "Modulate",
				id: "m",
				props: { at: 1, over: 1 },
				children: [
					{
						type: "StackH",
						props: { spacing: 10, total: 130 },
						children: [ref("a"), ref("b")],
					},
				],
			},
			{
				type: "Motion",
				id: "spin",
				props: {
					at: 2.5,
					steps: [{ to: { rotate: 180 }, over: 1, ease: "linear" }],
				},
				children: [ref("b")],
			},
		]),
	);
	await seek(page, 2.2);
	const before = (await centres(page, ["b"])).b;
	expect(before.width).toBeGreaterThan(30);
	await seek(page, 3.5);
	const after = (await centres(page, ["b"])).b;
	expect(after.x).toBeCloseTo(before.x, 1);
	expect(after.y).toBeCloseTo(before.y, 1);
});

test("modulations in two clocks add up on a connector and on a box", async ({
	page,
}) => {
	const pair = (id: string, ids: string[]): N => ({
		type: "StackH",
		id,
		props: { spacing: 20 },
		children: ids.map((i) => rect(i, { width: 20, height: 20 })),
	});
	const swap = (id: string, ids: string[], at: number): N => ({
		type: "Modulate",
		id,
		props: { at, over: 1 },
		children: [
			{ type: "StackH", props: { spacing: 20 }, children: ids.map(ref) },
		],
	});
	await page.setContent(
		svgOf([
			{
				type: "StackV",
				id: "col",
				props: { spacing: 40 },
				children: [pair("r1", ["a", "a2"]), pair("r2", ["b", "b2"])],
			},
			{ type: "Arrow", id: "k", children: [ref("a"), ref("b")] },
			swap("m", ["a2", "a"], 1),
			{
				type: "Phrase",
				id: "ph",
				props: { at: 1 },
				children: [swap("n", ["b2", "b"], 0)],
			},
		]),
	);
	for (const t of [1.3, 1.6, 2.5]) {
		await seek(page, t);
		const { a, b } = await centres(page, ["a", "b"]);
		const k = await endsOf(page, "k");
		expect(Math.abs(k.x1 - a.x)).toBeLessThan(1);
		expect(Math.abs(k.x2 - b.x)).toBeLessThan(1);
	}

	const stack = (id: string, ids: string[], at: number): N => ({
		type: "Modulate",
		id,
		props: { at, over: 1 },
		children: [
			{ type: "StackV", props: { spacing: 5 }, children: ids.map(ref) },
		],
	});
	await page.setContent(
		svgOf([
			{
				type: "Background",
				id: "bg",
				props: { padding: 6, "stroke-width": 0, fill: "#eee" },
				children: [
					{
						type: "StackH",
						id: "row",
						props: { spacing: 5 },
						children: ["a", "b", "c"].map((i) =>
							rect(i, { width: 20, height: 20 }),
						),
					},
				],
			},
			stack("m", ["a", "b"], 1),
			{
				type: "Phrase",
				id: "ph",
				props: { at: 1.5 },
				children: [stack("n", ["b", "c"], 0)],
			},
		]),
	);
	await seek(page, 0);
	const home = (await centres(page, ["bg"])).bg;
	await seek(page, 3);
	const end = (await centres(page, ["bg"])).bg;
	expect(end.height).toBeGreaterThan(home.height + 20);
	expect(end.width).toBeLessThan(home.width - 20);
});

const handoff = (): string => {
	const under = (worker: string): N => ({
		type: "StackV",
		props: { spacing: 12 },
		children: [ref(worker), ref("job")],
	});
	const hop = (id: string, worker: string, at: number): N => ({
		type: "Modulate",
		id,
		props: { at, over: 0.35, ease: "inOut" },
		children: [under(worker)],
	});
	return svgOf(
		[
			{
				type: "StackV",
				id: "floor",
				props: { spacing: 70 },
				children: [
					{
						type: "StackH",
						id: "row",
						props: { spacing: 36 },
						children: ["w1", "w2", "w3"].map((w) =>
							rect(w, { width: 70, height: 30 }),
						),
					},
					rect("log", { width: 50, height: 30 }),
				],
			},
			rect("job", { width: 18, height: 18 }),
			under("w1"),
			{ type: "Arrow", id: "report", children: [ref("job"), ref("log")] },
			hop("to2", "w2", 0.4),
			hop("to3", "w3", 1.2),
			{ type: "Resolve", id: "back", props: { at: 2, over: 0.35 } },
			{ type: "Rest", props: { at: 0, over: 2.8 } },
		],
		true,
	);
};

/** How far the arrow starts from the job, sampled while the page plays. */
const separation = (page: Page, frames: number) =>
	page.evaluate(async (count) => {
		const svg = document.querySelector("svg") as SVGSVGElement;
		const job = svg.querySelector("#job") as SVGRectElement;
		const paths = [
			...svg.querySelectorAll<SVGPathElement>("#report, #report-still"),
		];
		let worst = 0;
		const seen = new Set<number>();
		for (let i = 0; i < count; i++) {
			await new Promise((r) => requestAnimationFrame(r));
			const path =
				paths.find((p) => getComputedStyle(p).display !== "none") ?? paths[0];
			const origin = svg.getBoundingClientRect();
			const r = job.getBoundingClientRect();
			const [x, y] = [
				r.x + r.width / 2 - origin.x,
				r.y + r.height / 2 - origin.y,
			];
			const p = path.getPointAtLength(0);
			worst = Math.max(worst, Math.hypot(p.x - x, p.y - y));
			seen.add(Math.round(x));
		}
		return { worst, places: seen.size };
	}, frames);

// The arrow leaves the job's edge 5px out; anything past this is a detached arrow
const ATTACHED = 22;

test("an arrow stays on the box it is attached to while the page plays", async ({
	page,
}) => {
	// A busy first frame is what lets a second clock run ahead
	await page.setContent(
		`<body>${handoff()}<script>const t = performance.now(); while (performance.now() - t < 300);</script></body>`,
	);
	const { worst, places } = await separation(page, 170);
	expect(places).toBeGreaterThan(10);
	expect(worst).toBeLessThan(ATTACHED);
});

test("the path follows the CSS clock even when SMIL is somewhere else", async ({
	page,
}) => {
	await page.setContent(handoff());
	await seek(page, 1.4, 0);
	const { job } = await centres(page, ["job"]);
	const arrow = await endsOf(page, "report");
	expect(Math.hypot(arrow.x1 - job.x, arrow.y1 - job.y)).toBeLessThan(ATTACHED);
});

test("the Handoff example keeps its arrow on the job", async ({ page }) => {
	await page.goto("http://localhost:5173/animation/");
	const graphic = page.locator("svg:has(#report)");
	await graphic.scrollIntoViewIfNeeded();
	const worst = await graphic.evaluate(async (svg: SVGSVGElement) => {
		const job = svg.querySelector("#job") as SVGRectElement;
		const path = svg.querySelector("#report") as SVGPathElement;
		let far = 0;
		for (let i = 0; i < 200; i++) {
			await new Promise((r) => requestAnimationFrame(r));
			const origin = svg.getBoundingClientRect();
			const r = job.getBoundingClientRect();
			const p = path.getPointAtLength(0);
			far = Math.max(
				far,
				Math.hypot(
					p.x - (r.x + r.width / 2 - origin.x),
					p.y - (r.y + r.height / 2 - origin.y),
				),
			);
		}
		return far;
	});
	expect(worst).toBeLessThan(ATTACHED);
});

test("reduced motion holds the still frame through Graphic", async ({
	page,
}) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("http://localhost:5173/animation/");
	const graphic = page.locator("svg:has(#report)");
	await graphic.scrollIntoViewIfNeeded();
	const measure = () =>
		graphic.evaluate((svg: SVGSVGElement) => {
			const job = (
				svg.querySelector("#job") as SVGRectElement
			).getBoundingClientRect();
			const origin = svg.getBoundingClientRect();
			const paths = [
				...svg.querySelectorAll<SVGPathElement>("#report, #report-still"),
			];
			const path = paths.find((p) => getComputedStyle(p).display !== "none");
			const p = path?.getPointAtLength(0);
			const [x, y] = [
				job.x + job.width / 2 - origin.x,
				job.y + job.height / 2 - origin.y,
			];
			return {
				x,
				y,
				far: p ? Math.hypot(p.x - x, p.y - y) : Number.POSITIVE_INFINITY,
				running: svg
					.getAnimations({ subtree: true })
					.filter((a) => a.playState === "running").length,
			};
		});
	const first = await measure();
	await page.waitForTimeout(700);
	const later = await measure();
	expect(first.running).toBe(0);
	expect(later).toEqual(first);
	expect(first.far).toBeLessThan(ATTACHED);
});

test("every animation example mounts without a warning from the solver", async ({
	page,
}) => {
	const warnings: string[] = [];
	page.on("console", (m) => {
		if (m.text().startsWith("modular-svg:")) warnings.push(m.text());
	});
	await page.goto("http://localhost:5173/animation/");
	await page.waitForTimeout(500);
	expect(warnings).toEqual([]);
});

// --- connectors and the motions on their ends --------------------------------

/**
 * How far the shown path of a connector ends from the edge of a box (0 when
 * it ends inside), and how far its arrowhead is from that end.
 */
const reach = (
	page: Page,
	arrow: string,
	box: string,
	end: "start" | "end",
	root = "svg",
) =>
	page.evaluate(
		([arrowId, boxId, which, within]) => {
			const svg = document.querySelector(within) as SVGSVGElement;
			const shown = (id: string) => {
				const paths = [
					...svg.querySelectorAll<SVGGraphicsElement>(
						`[id="${id}"], [id="${id}-still"]`,
					),
				];
				return (
					paths.find((p) => getComputedStyle(p).display !== "none") ?? paths[0]
				);
			};
			const path = shown(arrowId) as SVGGeometryElement;
			const local = path.getPointAtLength(
				which === "start" ? 0 : path.getTotalLength(),
			);
			const p = new DOMPoint(local.x, local.y).matrixTransform(
				path.getScreenCTM() as DOMMatrix,
			);
			const r = (
				svg.querySelector(`[id="${boxId}"]`) as Element
			).getBoundingClientRect();
			const dx = Math.max(r.left - p.x, 0, p.x - r.right);
			const dy = Math.max(r.top - p.y, 0, p.y - r.bottom);
			const head = shown(`${arrowId}-head`)?.getBoundingClientRect();
			return {
				gap: Math.hypot(dx, dy),
				head: head
					? Math.hypot(
							head.x + head.width / 2 - p.x,
							head.y + head.height / 2 - p.y,
						)
					: 0,
				x: r.x + r.width / 2,
				y: r.y + r.height / 2,
			};
		},
		[arrow, box, end, root],
	);

// An arrow stops up to 11px short of the box it points at
const TOUCHING = 14;
const HEAD = 5;

const pad = (id: string, x: number, y: number): N =>
	rect(id, { x, y, width: 30, height: 20 });
const arrowTo = (id: string, from: string, to: string): N => ({
	type: "Arrow",
	id,
	props: { "stroke-width": 1.5 },
	children: [ref(from), ref(to)],
});
const slide = (id: string, target: string, to: N, props: N = {}): N => ({
	type: "Motion",
	id,
	props: { steps: [{ to, over: 1 }], ...props },
	children: [ref(target)],
});

test("an arrow stays on a box that a motion moves", async ({ page }) => {
	await page.setContent(
		svgOf([
			pad("base", 0, 0),
			pad("box", 0, 80),
			pad("far", 200, 160),
			arrowTo("in", "base", "box"),
			arrowTo("out", "box", "far"),
			{
				type: "Travel",
				id: "trip",
				props: { at: 0.5, over: 2, ease: "inOut" },
				children: [ref("box"), ref("far")],
			},
		]),
	);
	const seen: number[] = [];
	for (const t of [0, 0.5, 0.9, 1.3, 1.5, 1.9, 2.2, 2.5]) {
		await seek(page, t);
		const [into, out, at] = [
			await reach(page, "in", "box", "end"),
			await reach(page, "out", "box", "start"),
			await reach(page, "out", "far", "end"),
		];
		expect(into.gap, `in at ${t}s`).toBeLessThan(TOUCHING);
		expect(into.head, `head at ${t}s`).toBeLessThan(HEAD);
		expect(out.gap, `out at ${t}s`).toBeLessThan(TOUCHING);
		if (t < 2.2) expect(at.gap, `far end at ${t}s`).toBeLessThan(TOUCHING);
		seen.push(Math.round(into.x));
	}
	expect(new Set(seen).size).toBeGreaterThan(4);
});

test("it follows a phrase played backwards, a modulation and a group's motion at once", async ({
	page,
}) => {
	await page.setContent(
		svgOf([
			pad("base", 0, 0),
			pad("a", 0, 120),
			pad("b", 120, 120),
			{ type: "Group", id: "crate", children: [pad("box", 0, 60)] },
			{
				type: "Align",
				props: { alignment: "centerX" },
				children: [ref("a"), ref("box")],
			},
			arrowTo("in", "base", "box"),
			{
				type: "Modulate",
				id: "hop",
				props: { at: 0.5, over: 1, ease: "inOut" },
				children: [
					{
						type: "Align",
						props: { alignment: "centerX" },
						children: [ref("b"), ref("box")],
					},
				],
			},
			{
				type: "Phrase",
				id: "p",
				props: { at: 0, repeat: 2, alternate: true, retrograde: true },
				children: [slide("lift", "crate", { y: -30, x: 40 })],
			},
			{ type: "Rest", props: { at: 0, over: 2.5 } },
		]),
	);
	const seen: number[] = [];
	for (const t of [0, 0.3, 0.7, 1, 1.2, 1.6, 2, 2.5]) {
		await seek(page, t);
		const into = await reach(page, "in", "box", "end");
		expect(into.gap, `at ${t}s`).toBeLessThan(TOUCHING);
		expect(into.head, `head at ${t}s`).toBeLessThan(HEAD);
		seen.push(Math.round(into.x));
	}
	expect(new Set(seen).size).toBeGreaterThan(4);
});

test("an arrow rides along when one motion moves both its ends", async ({
	page,
}) => {
	const svg = svgOf([
		{
			type: "Group",
			id: "pair",
			children: [pad("base", 0, 0), pad("box", 100, 60)],
		},
		arrowTo("in", "base", "box"),
		slide("go", "pair", { x: 80, y: 20 }),
	]);
	expect(svg).not.toContain("<animate");
	await page.setContent(svg);
	for (const t of [0, 0.3, 0.6, 1]) {
		await seek(page, t);
		expect((await reach(page, "in", "box", "end")).gap).toBeLessThan(TOUCHING);
		expect((await reach(page, "in", "base", "start")).gap).toBeLessThan(
			TOUCHING,
		);
	}
});

test("reduced motion shows the arrow on the box where the still frame has it", async ({
	page,
}) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.setContent(
		svgOf([
			pad("base", 0, 0),
			pad("box", 0, 80),
			arrowTo("in", "base", "box"),
			slide("go", "box", { x: 150 }),
			{ type: "Draw", id: "ink", props: { over: 1 }, children: [ref("in")] },
		]),
	);
	const into = await reach(page, "in", "box", "end");
	expect(into.gap).toBeLessThan(TOUCHING);
	expect(into.head).toBeLessThan(HEAD);
	expect(into.x).toBeGreaterThan(150);
});

test("the Courier example keeps both arrows on the parcel", async ({
	page,
}) => {
	await page.goto("http://localhost:5173/animation/");
	const graphic = page.locator("svg:has(#parcel)");
	await graphic.scrollIntoViewIfNeeded();
	await graphic.evaluate((svg) => svg.setAttribute("data-courier", ""));
	const seen: number[] = [];
	for (const t of [0, 0.4, 0.8, 1.2, 1.6, 2, 2.4, 3, 3.6, 4.2, 4.8]) {
		await graphic.evaluate((svg: SVGSVGElement, at) => {
			for (const a of svg.getAnimations({ subtree: true })) {
				a.pause();
				a.currentTime = at * 1000;
			}
			svg.pauseAnimations();
			svg.setCurrentTime(at);
		}, t);
		const [sent, due] = [
			await reach(page, "sent", "parcel", "end", "svg[data-courier]"),
			await reach(page, "due", "parcel", "start", "svg[data-courier]"),
		];
		expect(sent.gap, `sent at ${t}s`).toBeLessThan(TOUCHING);
		expect(sent.head, `sent head at ${t}s`).toBeLessThan(HEAD);
		expect(due.gap, `due at ${t}s`).toBeLessThan(TOUCHING);
		seen.push(Math.round(sent.x));
	}
	// out over two docks and back again
	expect(new Set(seen).size).toBeGreaterThan(5);
	expect(seen[0]).toBe(seen.at(-1));
});

// --- what a Modulate may hold besides stacks ---------------------------------

/** The box an element is drawn in, in the svg's own pixels. */
const drawn = (page: Page, id: string, within = "svg") =>
	page.evaluate(
		([wanted, root]) => {
			const svg = document.querySelector(root) as SVGSVGElement;
			const origin = svg.getBoundingClientRect();
			const r = (
				svg.querySelector(`[id="${wanted}"]`) as Element
			).getBoundingClientRect();
			return {
				left: r.left - origin.x,
				top: r.top - origin.y,
				right: r.right - origin.x,
				bottom: r.bottom - origin.y,
			};
		},
		[id, within],
	);

test("a Background in a Modulate rewraps its box around other members", async ({
	page,
}) => {
	const wrap = (id: string, children: N[], padding: number): N => ({
		type: "Background",
		id,
		props: { padding, "stroke-width": 0, fill: "none" },
		children,
	});
	await page.setContent(
		svgOf([
			{
				type: "StackH",
				id: "row",
				props: { spacing: 10 },
				children: ["a", "b", "c"].map((id) => rect(id)),
			},
			wrap("frame", [ref("a")], 4),
			{
				type: "Modulate",
				id: "wider",
				props: { at: 1, over: 1, ease: "linear" },
				children: [wrap("w", [ref("frame"), ref("b"), ref("c")], 6)],
			},
			{
				type: "Resolve",
				id: "back",
				props: { at: 3, over: 1, ease: "linear" },
			},
		]),
	);
	const frameAt = async (t: number) => {
		await seek(page, t);
		return drawn(page, "frame");
	};
	const [a, b, c] = [
		await drawn(page, "a"),
		await drawn(page, "b"),
		await drawn(page, "c"),
	];
	const home = await frameAt(0.5);
	expect(home.left).toBeCloseTo(a.left - 4, 1);
	expect(home.right).toBeCloseTo(a.right + 4, 1);
	const held = await frameAt(2.5);
	expect(held.left).toBeCloseTo(b.left - 6, 1);
	expect(held.right).toBeCloseTo(c.right + 6, 1);
	expect(held.top).toBeCloseTo(b.top - 6, 1);
	expect(held.bottom).toBeCloseTo(b.bottom + 6, 1);
	// halfway there, every side is halfway
	const mid = await frameAt(1.5);
	expect(mid.left).toBeCloseTo((home.left + held.left) / 2, 1);
	expect(mid.right).toBeCloseTo((home.right + held.right) / 2, 1);
	expect(mid.top).toBeCloseTo((home.top + held.top) / 2, 1);
	expect(await frameAt(4)).toEqual(home);
});

test("a circle and an arc grow with the box a Modulate gives them", async ({
	page,
}) => {
	const fit = (id: string): N => ({
		type: "Modulate",
		id: "fit",
		props: { at: 1, over: 1, ease: "linear" },
		children: [
			{ type: "Span", props: { axis: "x" }, children: [ref("wide"), ref(id)] },
		],
	});
	const column = (mark: N): N => ({
		type: "StackV",
		id: "col",
		props: { alignment: "left", spacing: 40 },
		children: [mark, rect("wide", { width: 60 })],
	});
	const sides = async (id: string, t: number) => {
		await seek(page, t);
		return drawn(page, id);
	};

	await page.setContent(
		svgOf([
			column({
				type: "Circle",
				id: "dot",
				props: { r: 10, fill: "#888", "stroke-width": 0 },
			}),
			fit("dot"),
		]),
	);
	const wide = await drawn(page, "wide");
	const small = await sides("dot", 0.5);
	expect(small.right - small.left).toBeCloseTo(20, 1);
	const half = await sides("dot", 1.5);
	expect(half.right - half.left).toBeCloseTo(40, 1);
	const grown = await sides("dot", 2.5);
	// as wide as the box it spans, and round: all of it is on the canvas
	expect(grown.left).toBeCloseTo(wide.left, 1);
	expect(grown.right).toBeCloseTo(wide.right, 1);
	expect(grown.top).toBeCloseTo(small.top, 1);
	expect(grown.bottom - grown.top).toBeCloseTo(60, 1);
	const canvas = await page.evaluate(() => {
		const svg = document.querySelector("svg") as SVGSVGElement;
		return svg.getBoundingClientRect().height;
	});
	expect(grown.bottom).toBeLessThanOrEqual(canvas + 0.01);

	await page.setContent(
		svgOf([
			column({
				type: "Arc",
				id: "pie",
				props: { r: 10, startAngle: 0, endAngle: 360, fill: "#888" },
			}),
			fit("pie"),
		]),
	);
	const ring = await sides("pie", 2.5);
	expect(ring.left).toBeCloseTo(wide.left, 0);
	expect(ring.right).toBeCloseTo(wide.right, 0);
	expect(ring.top).toBeGreaterThanOrEqual(-0.5);
	expect(ring.bottom - ring.top).toBeCloseTo(60, 0);
	const between = await sides("pie", 1.5);
	expect(between.right - between.left).toBeCloseTo(40, 0);
});

test("the Selection example keeps its frame round the days it has picked", async ({
	page,
}) => {
	await page.goto("http://localhost:5173/animation/");
	const graphic = page.locator("svg:has(#pick)");
	await graphic.scrollIntoViewIfNeeded();
	await graphic.evaluate((svg) => svg.setAttribute("data-selection", ""));
	const at = async (t: number) => {
		await graphic.evaluate((svg: SVGSVGElement, time) => {
			for (const a of svg.getAnimations({ subtree: true })) {
				a.pause();
				a.currentTime = time * 1000;
			}
		}, t);
		const box = (id: string) => drawn(page, id, "svg[data-selection]");
		return {
			pick: await box("pick"),
			Mon: await box("Mon"),
			Wed: await box("Wed"),
			Thu: await box("Thu"),
			Fri: await box("Fri"),
		};
	};
	// the frame's stroke is 2.5 wide and the days' 1, both drawn on the edge
	const gap = (padding: number) => padding + 1.25 - 0.5;
	const home = await at(0.3);
	expect(home.pick.left).toBeCloseTo(home.Mon.left - gap(4), 1);
	expect(home.pick.right).toBeCloseTo(home.Mon.right + gap(4), 1);
	const three = await at(1.5);
	expect(three.pick.left).toBeCloseTo(three.Mon.left - gap(4), 1);
	expect(three.pick.right).toBeCloseTo(three.Wed.right + gap(4), 1);
	const weekend = await at(2.8);
	expect(weekend.pick.left).toBeCloseTo(weekend.Thu.left - gap(9), 1);
	expect(weekend.pick.right).toBeCloseTo(weekend.Fri.right + gap(9), 1);
	expect(weekend.pick.top).toBeCloseTo(weekend.Fri.top - gap(9), 1);
	// on its way from one to the other it is still one box, somewhere between
	const moving = await at(2.15);
	expect(moving.pick.left).toBeGreaterThan(three.pick.left + 5);
	expect(moving.pick.left).toBeLessThan(weekend.pick.left - 5);
	expect((await at(4.2)).pick).toEqual(home.pick);
	// the days themselves never move
	expect(weekend.Mon).toEqual(home.Mon);
});

test("the Drum fill example lands its crash on the scene's beat", async ({
	page,
}) => {
	const problems: string[] = [];
	page.on("console", (m) => {
		if (m.type() === "warning" || m.type() === "error") problems.push(m.text());
	});
	await page.goto("http://localhost:5173/animation/");
	const graphic = page.locator("svg:has(#crash)");
	await graphic.scrollIntoViewIfNeeded();
	await graphic.evaluate((svg) => svg.setAttribute("data-fill", ""));
	const at = async (t: number) => {
		await graphic.evaluate((svg: SVGSVGElement, time) => {
			for (const a of svg.getAnimations({ subtree: true })) {
				a.pause();
				a.currentTime = time * 1000;
			}
		}, t);
		const width = async (id: string) => {
			const box = await drawn(page, id, "svg[data-fill]");
			return box.right - box.left;
		};
		const slider = await drawn(page, "slider", "svg[data-fill]");
		return {
			crash: await width("crash"),
			tom2: await width("tom2"),
			metronome: await width("metronome"),
			slider: slider.left,
		};
	};
	// the fill starts at 0.7s and plays at twice the speed: the last tom is in
	// by 1.05s, and the crash holds off until the beat at 1.5s
	const waiting = await at(1.2);
	expect(waiting.tom2).toBeCloseTo(22, 0);
	expect(waiting.crash).toBeCloseTo(32 * 0.4, 0);
	expect((await at(1.49)).crash).toBeCloseTo(32 * 0.4, 0);
	// on the beat the metronome is at its largest and the crash sets off
	const onBeat = await at(1.51);
	expect(onBeat.metronome).toBeGreaterThan(12 * 1.5);
	expect(onBeat.crash).toBeGreaterThan(32 * 0.4 + 1);
	expect((await at(1.99)).metronome).toBeCloseTo(12, 0);
	// 0.6 of the phrase's seconds is 0.3 of the scene's
	expect((await at(1.85)).crash).toBeCloseTo(32, 0);
	// the slider goes out over one beat and comes back over the next
	const home = (await at(0)).slider;
	expect((await at(0.5)).slider).toBeCloseTo(home + 60, 0);
	// the way back mirrors the way out, ease included
	const out = (await at(0.2)).slider;
	expect(out).toBeGreaterThan(home + 5);
	expect(out).toBeLessThan(home + 55);
	expect((await at(0.8)).slider).toBeCloseTo(out, 0);
	expect((await at(1)).slider).toBeCloseTo(home, 0);
	expect((await at(1.5)).slider).toBeCloseTo(home + 60, 0);
	expect(problems).toEqual([]);
});

// --- springs and routes ----------------------------------------------------------

const dot = (id: string, x: number, y: number, r = 5): N => ({
	type: "Circle",
	id,
	props: { r, cx: x, cy: y, "stroke-width": 0, fill: "#888" },
});
const on = (type: string, id: string, target: string, props: N): N => ({
	type,
	id,
	props,
	children: [ref(target)],
});
const times = (from: number, to: number, count: number): number[] =>
	Array.from({ length: count + 1 }, (_, i) => from + ((to - from) * i) / count);

test("a spring enter runs past where it rests, then rests there", async ({
	page,
}) => {
	await page.setContent(
		svgOf([
			rect("a", { x: 100, y: 0 }),
			rect("mark", { x: 0, y: 30, width: 200 }),
			on("Enter", "in", "a", { from: { x: -80 }, ease: "spring", over: 1 }),
		]),
	);
	const xs: number[] = [];
	for (const t of times(0, 1, 25)) {
		await seek(page, t);
		xs.push((await centres(page, ["a"])).a.x);
	}
	const home = xs[xs.length - 1];
	expect(xs[0]).toBeCloseTo(home - 80, 1);
	// A bounce of 0.4 overshoots by about a tenth of the way
	expect(Math.max(...xs)).toBeGreaterThan(home + 5);
	expect(Math.max(...xs)).toBeLessThan(home + 10);
	await seek(page, 5);
	expect((await centres(page, ["a"])).a.x).toBeCloseTo(home, 1);
});

test("a spring never fades past opaque or draws past the whole stroke", async ({
	page,
}) => {
	await page.setContent(
		svgOf([
			rect("a"),
			{
				type: "Path",
				id: "line",
				props: { d: "M 0 40 L 120 40", "stroke-width": 2 },
			},
			on("Enter", "fade", "a", { ease: "spring", over: 1 }),
			on("Draw", "stroke", "line", { ease: "spring", over: 1 }),
		]),
	);
	const seen: { opacity: number; offset: number }[] = [];
	for (const t of times(0, 1, 40)) {
		await seek(page, t);
		seen.push(
			await page.evaluate(() => {
				const a = document.querySelector("#a") as Element;
				const line = document.querySelector("#line") as Element;
				return {
					opacity: Number(getComputedStyle(a.parentElement as Element).opacity),
					offset: Number.parseFloat(getComputedStyle(line).strokeDashoffset),
				};
			}),
		);
	}
	expect(Math.max(...seen.map((s) => s.opacity))).toBe(1);
	expect(Math.min(...seen.map((s) => s.offset))).toBe(0);
	// Both spend a good while clamped, having got there early
	expect(seen.filter((s) => s.opacity === 1).length).toBeGreaterThan(8);
	expect(seen[10].opacity).toBeGreaterThan(0.3);
	expect(seen[0]).toEqual({ opacity: 0, offset: 1 });
});

const waypoints = [
	{ x: 20, y: 20 },
	{ x: 140, y: 110 },
	{ x: 260, y: 30 },
	{ x: 330, y: 150 },
];
const course = (props: N, mover: N = dot("mover", 20, 20)): N[] => [
	...waypoints.slice(1).map((p, i) => dot(`w${i}`, p.x, p.y, 3)),
	mover,
	{
		type: "Travel",
		id: "trip",
		props: { over: 2, ease: "linear", ...props },
		children: [ref("mover"), ...waypoints.slice(1).map((_, i) => ref(`w${i}`))],
	},
];

test("a smooth route passes where core says it does", async ({ page }) => {
	await page.setContent(svgOf(course({ route: "smooth" })));
	const curve = smoothThrough(waypoints);
	const route = routeOf(curve.points);
	const total = route.lengths[route.lengths.length - 1];
	await seek(page, 0);
	const start = (await centres(page, ["mover"])).mover;
	for (const f of [0.1, 0.3, 0.5, 0.75, 1]) {
		await seek(page, 2 * f);
		const at = (await centres(page, ["mover"])).mover;
		const want = along(route, total * f);
		expect(
			Math.hypot(
				at.x - start.x - (want.x - waypoints[0].x),
				at.y - start.y - (want.y - waypoints[0].y),
			),
			`at ${f}`,
		).toBeLessThan(1);
	}
	// It rounds the corner at the first waypoint rather than turning on it
	await seek(page, 2 * 0.3);
	const bend = (await centres(page, ["mover", "w0"])) as Record<
		string,
		{ x: number; y: number }
	>;
	expect(bend.mover.y).toBeLessThan(bend.w0.y + 12);
});

test("an oriented mover faces along its route", async ({ page }) => {
	await page.setContent(
		svgOf([
			dot("down", 20, 205, 2),
			dot("across", 220, 205, 2),
			rect("mover", { x: 0, y: 0 }),
			{
				type: "Travel",
				id: "trip",
				props: { over: 2, ease: "linear", orient: true },
				children: [ref("mover"), ref("down"), ref("across")],
			},
		]),
	);
	// The first leg runs straight down: the 40x10 mover stands on end
	await seek(page, 0.5);
	const falling = (await centres(page, ["mover"])).mover;
	expect(falling.width).toBeCloseTo(10, 0);
	expect(falling.height).toBeCloseTo(40, 0);
	// The second runs to the right: it lies flat again, further along
	await seek(page, 1.6);
	const flying = (await centres(page, ["mover"])).mover;
	expect(flying.width).toBeCloseTo(40, 0);
	expect(flying.height).toBeCloseTo(10, 0);
	expect(flying.x).toBeGreaterThan(falling.x + 50);
	// Turned about its own centre, so the centre is still on the route
	expect(falling.x).toBeCloseTo(20, 0);
});

/** How far the centre of a mark is from the nearest point of a drawn path. */
const offPath = (page: Page, mark: string, path: string) =>
	page.evaluate(
		([markId, pathId]) => {
			const svg = document.querySelector("svg") as SVGSVGElement;
			const line = svg.querySelector(`[id="${pathId}"]`) as SVGGeometryElement;
			const r = (
				svg.querySelector(`[id="${markId}"]`) as Element
			).getBoundingClientRect();
			const [x, y] = [r.x + r.width / 2, r.y + r.height / 2];
			const ctm = line.getScreenCTM() as DOMMatrix;
			const length = line.getTotalLength();
			let [best, where] = [Infinity, 0];
			for (let i = 0; i <= 1000; i++) {
				const p = new DOMPoint(
					line.getPointAtLength((length * i) / 1000).x,
					line.getPointAtLength((length * i) / 1000).y,
				).matrixTransform(ctm);
				const d = Math.hypot(p.x - x, p.y - y);
				if (d < best) [best, where] = [d, i / 1000];
			}
			return { gap: best, where };
		},
		[mark, path],
	);

test("a mover rides the curve it is sent along", async ({ page }) => {
	await page.setContent(
		svgOf([
			rect("a", { x: 0, y: 0 }),
			rect("b", { x: 220, y: 140 }),
			{ type: "Curve", id: "wire", children: [ref("a"), ref("b")] },
			dot("mover", 100, 20, 4),
			{
				type: "Travel",
				id: "trip",
				props: { at: 0.5, over: 2, ease: "linear", route: "along" },
				children: [ref("mover"), ref("wire")],
			},
		]),
	);
	const seen: number[] = [];
	// Before the trip starts it already sits on the start of the wire
	for (const t of [0, 0.5, 0.9, 1.3, 1.5, 1.9, 2.2, 2.5]) {
		await seek(page, t);
		const { gap, where } = await offPath(page, "mover", "wire");
		expect(gap, `at ${t}s`).toBeLessThan(1);
		seen.push(where);
	}
	expect(seen[0]).toBeLessThan(0.01);
	expect(seen[1]).toBeLessThan(0.01);
	// Even speed along the curve: a fifth of the trip is a fifth of its length
	expect(seen[2]).toBeCloseTo(0.2, 1);
	expect(seen[4]).toBeCloseTo(0.5, 1);
	expect(seen[7]).toBeGreaterThan(0.99);
});

test("a route plays backwards in a retrograde phrase", async ({ page }) => {
	const positions = async (retrograde: boolean) => {
		await page.setContent(
			svgOf([
				...course({ route: "smooth" }).slice(0, -1),
				{
					type: "Phrase",
					id: "p",
					props: { retrograde },
					children: [course({ route: "smooth" }).at(-1) as N],
				},
			]),
		);
		const seen: { x: number; y: number }[] = [];
		for (const t of times(0, 2, 8)) {
			await seek(page, t);
			seen.push((await centres(page, ["mover"])).mover);
		}
		return seen;
	};
	const forward = await positions(false);
	const back = await positions(true);
	back.reverse();
	forward.forEach((p, i) => {
		expect(
			Math.hypot(p.x - back[i].x, p.y - back[i].y),
			`key ${i}`,
		).toBeLessThan(1);
	});
	expect(Math.hypot(forward[8].x - forward[0].x)).toBeGreaterThan(200);
});

test("an arrow stays on a mover that takes a smooth route", async ({
	page,
}) => {
	await page.setContent(
		svgOf([
			pad("base", 150, 220),
			...course({ route: "smooth" }, pad("mover", 5, 10)),
			arrowTo("lead", "base", "mover"),
		]),
	);
	const seen: number[] = [];
	for (const t of times(0, 2, 12)) {
		await seek(page, t);
		const at = await reach(page, "lead", "mover", "end");
		expect(at.gap, `at ${t}s`).toBeLessThan(TOUCHING);
		expect(at.head, `head at ${t}s`).toBeLessThan(HEAD);
		seen.push(Math.round(at.x));
	}
	expect(new Set(seen).size).toBeGreaterThan(8);
});

test("an arrow stays on a box through the overshoot of a spring Modulate", async ({
	page,
}) => {
	await page.setContent(
		svgOf([
			{
				type: "StackH",
				id: "row",
				props: { spacing: 40 },
				children: [pad("a", 0, 0), pad("b", 0, 0)],
			},
			arrowTo("k", "a", "b"),
			{
				type: "Modulate",
				id: "m",
				props: { at: 0.2, over: 1, ease: { kind: "spring", bounce: 0.6 } },
				children: [
					{
						type: "StackH",
						props: { spacing: 200 },
						children: [ref("a"), ref("b")],
					},
				],
			},
		]),
	);
	const xs: number[] = [];
	for (const t of times(0.2, 1.2, 25)) {
		await seek(page, t);
		const at = await reach(page, "k", "b", "end");
		// The arrow stops 5 to 11px short of the box, and nowhere further
		expect(at.gap, `at ${t}s`).toBeLessThan(TOUCHING);
		expect(at.gap, `at ${t}s`).toBeGreaterThan(3);
		expect(at.head, `head at ${t}s`).toBeLessThan(HEAD);
		xs.push(at.x);
	}
	// b went well past where it settles, and the arrow was on it there
	expect(Math.max(...xs)).toBeGreaterThan(xs[xs.length - 1] + 20);
});

test("a Graphic transition on a spring overshoots and lands", async ({
	page,
}) => {
	const fixture = fileURLToPath(
		new URL("./fixtures/spring.tsx", import.meta.url),
	);
	await page.goto("http://localhost:5173/");
	await page.addScriptTag({ type: "module", url: `/@fs${fixture}` });
	await page.waitForFunction(() => "mount" in window);
	await page.evaluate(() => (window as never as { mount: () => void }).mount());
	await page.waitForSelector("#sprung #b");
	const left = () =>
		page.evaluate(() => {
			const svg = document.querySelector("#sprung svg") as SVGSVGElement;
			const b = svg.querySelector("#b") as SVGRectElement;
			return b.getBoundingClientRect().x - svg.getBoundingClientRect().x;
		});
	expect(await left()).toBeCloseTo(130, 0);
	await page.evaluate(() =>
		(window as never as { change: () => void }).change(),
	);
	const seen: number[] = [];
	for (let i = 0; i < 30; i++) {
		await page.waitForTimeout(30);
		seen.push(await left());
	}
	// It moves (the tween runs), goes past 30 and comes back to it
	expect(seen.some((x) => x > 35 && x < 125)).toBe(true);
	expect(Math.min(...seen)).toBeLessThan(28);
	await page.waitForTimeout(400);
	expect(await left()).toBeCloseTo(30, 0);
});

test("the Flight path example keeps the plane on its trail", async ({
	page,
}) => {
	await page.goto("http://localhost:5173/animation/");
	const svg = page.locator("section", {
		has: page.getByRole("heading", { name: "Flight path", exact: true }),
	});
	await svg.locator("svg [id='plane']").waitFor();
	const at = (t: number) =>
		page.evaluate((time) => {
			const root = [...document.querySelectorAll("main svg")].find((s) =>
				s.querySelector("[id='plane']"),
			) as SVGSVGElement;
			for (const a of root.getAnimations({ subtree: true })) {
				a.pause();
				a.currentTime = time * 1000;
			}
			const centre = (el: Element) => {
				const r = el.getBoundingClientRect();
				return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
			};
			const trail = root.querySelector("[id='trail']") as SVGGeometryElement;
			const drawn =
				1 - Number.parseFloat(getComputedStyle(trail).strokeDashoffset);
			const tip = trail.getPointAtLength(trail.getTotalLength() * drawn);
			const p = new DOMPoint(tip.x, tip.y).matrixTransform(
				trail.getScreenCTM() as DOMMatrix,
			);
			const plane = centre(root.querySelector("[id='plane']") as Element);
			const holding = centre(root.querySelector("[id='holding']") as Element);
			return { gap: Math.hypot(p.x - plane.x, p.y - plane.y), drawn, holding };
		}, t);
	const drawn: number[] = [];
	for (const t of [0.5, 1.2, 1.8, 2.3, 2.9, 3.5, 4.1]) {
		const now = await at(t);
		expect(now.gap, `at ${t}s`).toBeLessThan(1.5);
		drawn.push(now.drawn);
	}
	expect(drawn[0]).toBeCloseTo(0, 2);
	expect(drawn[6]).toBeCloseTo(1, 2);
	// The holding pattern closes: a lap later the plane is where it was
	const [lap0, lap1, half] = [await at(0.4), await at(3.4), await at(1.9)];
	expect(
		Math.hypot(
			lap0.holding.x - lap1.holding.x,
			lap0.holding.y - lap1.holding.y,
		),
	).toBeLessThan(1);
	expect(
		Math.hypot(
			lap0.holding.x - half.holding.x,
			lap0.holding.y - half.holding.y,
		),
	).toBeGreaterThan(60);
});

// --- the camera ----------------------------------------------------------------

const camera = (id: string, props: N, ...targets: string[]): N => ({
	type: "Camera",
	id,
	props,
	children: targets.map(ref),
});
// A 340 by 170 canvas with a mark in two opposite corners
const near = rect("near", { x: 0, y: 0 });
const far = rect("far", { x: 300, y: 150, height: 20 });
// Framing `far` with 10 round it shows 80 by 40 of the canvas: 4.25 times
const ZOOM = 340 / 80;

test("a camera ends on what it frames, and gets there in a straight line at an even zoom", async ({
	page,
}) => {
	await page.setContent(
		svgOf([
			near,
			far,
			camera("on", { at: 0.5, over: 1, padding: 10, ease: "linear" }, "far"),
		]),
	);
	await seek(page, 0.25);
	expect((await centres(page, ["far"])).far).toMatchObject({
		x: 320,
		y: 160,
		width: 40,
	});
	// The framed mark fills the viewport but for its padding
	await seek(page, 1.5);
	const end = (await centres(page, ["far"])).far;
	expect(end.x).toBeCloseTo(170, 1);
	expect(end.y).toBeCloseTo(85, 1);
	expect(end.width).toBeCloseTo(40 * ZOOM, 1);
	expect(end.height).toBeCloseTo(170 - 2 * 10 * ZOOM, 1);

	// Halfway the zoom is the geometric mean, and the view is on the line
	// between the two framings
	await seek(page, 1);
	const mid = (await centres(page, ["far"])).far;
	const scale = Math.sqrt(ZOOM);
	expect(mid.width).toBeCloseTo(40 * scale, 0);
	const q = (340 / scale - 340) / (80 - 340);
	const view = { x: 170 + (320 - 170) * q, y: 85 + (160 - 85) * q };
	expect(mid.x).toBeCloseTo(170 + (320 - view.x) * scale, 0);
	expect(mid.y).toBeCloseTo(85 + (160 - view.y) * scale, 0);
});

test("a camera that follows keeps a travelling mark centred while the page plays", async ({
	page,
}) => {
	await page.setContent(
		svgOf([
			rect("mover", { x: 0, y: 0, width: 20, height: 10, fill: "#c33" }),
			rect("up", { x: 180, y: 0 }),
			rect("down", { x: 340, y: 180 }),
			{
				type: "Travel",
				id: "trip",
				props: { at: 0.2, over: 2.4, route: "smooth", ease: "inOut" },
				children: [ref("mover"), ref("up"), ref("down")],
			},
			camera("chase", { at: 0, over: 0, padding: 40, follow: true }, "mover"),
		]),
	);
	// Live, on the page's own clock: the mark's keyframes and the view's are
	// two CSS animations, and have to stay in step
	const { worst, places } = await page.evaluate(
		() =>
			new Promise<{ worst: number; places: number }>((resolve) => {
				const svg = document.querySelector("svg") as SVGSVGElement;
				const mover = svg.querySelector("#mover") as Element;
				const start = performance.now();
				let worst = 0;
				const seen = new Set<number>();
				const tick = () => {
					const [m, s] = [
						mover.getBoundingClientRect(),
						svg.getBoundingClientRect(),
					];
					worst = Math.max(
						worst,
						Math.hypot(
							m.x + m.width / 2 - (s.x + s.width / 2),
							m.y + m.height / 2 - (s.y + s.height / 2),
						),
					);
					const moved = getComputedStyle(
						mover.parentElement as Element,
					).translate;
					seen.add(Math.round(Number.parseFloat(moved)));
					if (performance.now() - start < 2000) requestAnimationFrame(tick);
					else resolve({ worst, places: seen.size });
				};
				requestAnimationFrame(tick);
			}),
	);
	expect(places).toBeGreaterThan(20);
	expect(worst).toBeLessThan(1);
});

test("reduced motion shows the view the still frame has", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.setContent(
		svgOf([near, far, camera("on", { at: 0.5, over: 1, padding: 10 }, "far")]),
	);
	const { far: shown } = await centres(page, ["far"]);
	expect(shown.x).toBeCloseTo(170, 1);
	expect(shown.y).toBeCloseTo(85, 1);
	expect(shown.width).toBeCloseTo(40 * ZOOM, 1);
});

test("a motion on a camera moves the view in screen pixels, about its middle", async ({
	page,
}) => {
	const on = (to: N): N => ({
		type: "Motion",
		id: "kick",
		props: { at: 0, steps: [{ to, over: 1, ease: "linear" }] },
		children: [ref("on")],
	});
	const framed = camera("on", { at: 0, over: 0, padding: 10 }, "far");
	await page.setContent(svgOf([near, far, framed, on({ x: 20, y: -8 })]));
	await seek(page, 1);
	const pushed = (await centres(page, ["far"])).far;
	expect(pushed.x).toBeCloseTo(190, 1);
	expect(pushed.y).toBeCloseTo(77, 1);
	expect(pushed.width).toBeCloseTo(40 * ZOOM, 1);

	await page.setContent(svgOf([near, far, framed, on({ scale: 2 })]));
	await seek(page, 1);
	const punched = (await centres(page, ["far"])).far;
	expect(punched.x).toBeCloseTo(170, 1);
	expect(punched.y).toBeCloseTo(85, 1);
	expect(punched.width).toBeCloseTo(80 * ZOOM, 1);
});

test("a mark still turns and scales about its own middle inside a zoomed view", async ({
	page,
}) => {
	const svg = (view?: { width: number; height: number }) => {
		const scene = buildSceneFromJson({
			type: "Group",
			id: "root",
			children: [
				near,
				far,
				camera("on", { at: 0, over: 0, padding: 10 }, "far"),
				{
					type: "Motion",
					id: "grow",
					props: { at: 0, steps: [{ to: { scale: 2 }, over: 1 }] },
					children: [ref("far")],
				},
			],
		});
		return layoutToSvg(solveLayout(scene), scene.nodes, 0, { view });
	};
	await page.setContent(svg());
	await seek(page, 1);
	const grown = (await centres(page, ["far"])).far;
	expect(grown.x).toBeCloseTo(170, 1);
	expect(grown.y).toBeCloseTo(85, 1);
	expect(grown.width).toBeCloseTo(80 * ZOOM, 1);

	// The same in a viewport twice the size of the canvas
	await page.setContent(svg({ width: 680, height: 340 }));
	await seek(page, 1);
	const doubled = (await centres(page, ["far"])).far;
	expect(doubled.x).toBeCloseTo(340, 1);
	expect(doubled.y).toBeCloseTo(170, 1);
	expect(doubled.width).toBeCloseTo(160 * ZOOM, 1);
});

const mountViews = async (page: Page) => {
	const fixture = fileURLToPath(
		new URL("./fixtures/camera.tsx", import.meta.url),
	);
	await page.goto("http://localhost:5173/");
	await page.addScriptTag({ type: "module", url: `/@fs${fixture}` });
	await page.waitForFunction(() => "mount" in window);
	await page.evaluate(() => (window as never as { mount: () => void }).mount());
	await page.waitForSelector("#scrub [data-camera]");
	return (graphic: string, id: string) =>
		page.evaluate(
			([within, mark]) => {
				const svg = document.querySelector(`#${within} svg`) as SVGSVGElement;
				const [r, origin] = [
					(svg.querySelector(`#${mark}`) as Element).getBoundingClientRect(),
					svg.getBoundingClientRect(),
				];
				return {
					x: r.x + r.width / 2 - origin.x,
					y: r.y + r.height / 2 - origin.y,
					width: r.width,
				};
			},
			[graphic, id],
		);
};

test("Graphic's playhead scrubs the view", async ({ page }) => {
	const box = await mountViews(page);
	const hold = (t: number | undefined) =>
		page.evaluate(
			(time) =>
				(window as never as { hold: (t?: number) => void }).hold(
					time ?? undefined,
				),
			t,
		);
	await hold(0);
	await expect
		.poll(async () => (await box("scrub", "b")).width)
		.toBeCloseTo(40, 0);
	await hold(1);
	await expect
		.poll(async () => (await box("scrub", "b")).width)
		.toBeCloseTo(40 * Math.sqrt(10), 0);
	await hold(2);
	const end = await box("scrub", "b");
	expect(end.width).toBeCloseTo(400, 0);
	expect(end.x).toBeCloseTo(200, 0);
	expect(end.y).toBeCloseTo(100, 0);
});

test("Graphic's transition moves the view when what the camera frames changes", async ({
	page,
}) => {
	const box = await mountViews(page);
	const frame = (id: string | null) =>
		page.evaluate(
			(target) =>
				(window as never as { frame: (id: string | null) => void }).frame(
					target,
				),
			id,
		);
	expect((await box("focus", "b")).width).toBeCloseTo(40, 0);
	await frame("b");
	const seen: number[] = [];
	for (let i = 0; i < 12; i++) {
		await page.waitForTimeout(40);
		seen.push((await box("focus", "b")).width);
	}
	// It passes through the zooms in between, and never past the target
	expect(seen.filter((w) => w > 60 && w < 380).length).toBeGreaterThan(3);
	expect(Math.max(...seen)).toBeLessThan(401);
	await page.waitForTimeout(400);
	const framed = await box("focus", "b");
	expect(framed.width).toBeCloseTo(400, 0);
	expect(framed.x).toBeCloseTo(200, 0);

	// Back out, caught halfway and sent to the other mark instead
	await frame(null);
	await page.waitForTimeout(250);
	const between = (await box("focus", "b")).width;
	expect(between).toBeGreaterThan(45);
	expect(between).toBeLessThan(395);
	await frame("a");
	await page.waitForTimeout(900);
	const other = await box("focus", "a");
	expect(other.width).toBeCloseTo(400, 0);
	expect(other.x).toBeCloseTo(200, 0);
	expect(other.y).toBeCloseTo(100, 0);
});

test("a change that leaves the camera alone does not hold a view that is moving", async ({
	page,
}) => {
	const box = await mountViews(page);
	await page.waitForTimeout(600);
	const before = (await box("tint", "b")).width;
	await page.evaluate(() =>
		(window as never as { tint: (fill: string) => void }).tint("#ff0000"),
	);
	// A 10x push over four seconds: the mark grows 9% in every 150ms
	const seen: number[] = [before];
	for (let i = 0; i < 4; i++) {
		await page.waitForTimeout(150);
		seen.push((await box("tint", "b")).width);
	}
	for (let i = 1; i < seen.length; i++)
		expect(seen[i] / seen[i - 1], `step ${i} of ${seen}`).toBeGreaterThan(1.04);
	// And no step when the tween is over
	for (let i = 1; i < seen.length; i++)
		expect(seen[i] / seen[i - 1]).toBeLessThan(1.25);
});

const exampleAt = (page: Page, mark: string) => (t: number, ids: string[]) =>
	page.evaluate(
		([within, time, wanted]) => {
			const svg = [...document.querySelectorAll("main svg")].find((s) =>
				s.querySelector(`[id='${within}']`),
			) as SVGSVGElement;
			for (const a of svg.getAnimations({ subtree: true })) {
				a.pause();
				a.currentTime = (time as number) * 1000;
			}
			const origin = svg.getBoundingClientRect();
			return Object.fromEntries(
				(wanted as string[]).map((id) => {
					const r = (
						svg.querySelector(`[id='${id}']`) as Element
					).getBoundingClientRect();
					return [
						id,
						{
							x: r.x + r.width / 2 - origin.x,
							y: r.y + r.height / 2 - origin.y,
							width: r.width,
						},
					];
				}),
			);
		},
		[mark, t, ids] as const,
	);

test("the Tracking shot example stays on the parcel, then shows the whole map", async ({
	page,
}) => {
	await page.goto("http://localhost:5173/animation/");
	await page.locator("main svg [id='harbour']").waitFor();
	const at = exampleAt(page, "harbour");
	for (const t of [1.6, 2.4, 3.3, 4.2, 5.1, 6]) {
		const { cargo } = await at(t, ["cargo"]);
		expect(Math.hypot(cargo.x - 240, cargo.y - 135), `at ${t}s`).toBeLessThan(
			1.5,
		);
	}
	// Wide again at the last depot, with both ends of the road in view
	const wide = await at(7, ["harbour", "depot"]);
	expect(wide.harbour.x).toBeGreaterThan(0);
	expect(wide.depot.x).toBeLessThan(480);
	expect(wide.depot.x - wide.harbour.x).toBeGreaterThan(380);
});

test("the Architecture tour example visits every stage on the beat", async ({
	page,
}) => {
	await page.goto("http://localhost:5173/animation/");
	await page.locator("main svg [id='to-store']").waitFor({ state: "attached" });
	const at = exampleAt(page, "to-store");
	const beat = 60 / 48;
	const stages = ["client", "api", "queue", "workers", "store"];
	const wide = (await at(0.2, stages)).client.width;
	for (const [i, id] of stages.entries()) {
		// Settled 0.9s after its beat
		const shown = (await at((i + 1) * beat + 0.95, [id]))[id];
		expect(Math.hypot(shown.x - 240, shown.y - 135), id).toBeLessThan(1.5);
		expect(shown.width, id).toBeGreaterThan(wide * 2);
	}
	const back = (await at(6 * beat + 1.2, stages)).client.width;
	expect(back).toBeCloseTo(wide, 0);
});

// --- clips and masks ---------------------------------------------------------

type Rgb = [number, number, number];

/**
 * The pixels of one row of the page, from (x, y) rightwards: what was
 * painted, which geometry cannot say for a clip.
 */
const rowAt = async (
	page: Page,
	x: number,
	y: number,
	width: number,
): Promise<Rgb[]> => {
	const png = await page.screenshot({ clip: { x, y, width, height: 1 } });
	const chunks: Buffer[] = [];
	let channels = 4;
	for (let at = 8; at < png.length; ) {
		const length = png.readUInt32BE(at);
		const type = png.toString("latin1", at + 4, at + 8);
		const data = png.subarray(at + 8, at + 8 + length);
		// 8 bits a channel: truecolour, with alpha or without
		if (type === "IHDR") channels = data[9] === 6 ? 4 : 3;
		if (type === "IDAT") chunks.push(data);
		at += length + 12;
	}
	const [filter, ...line] = inflateSync(Buffer.concat(chunks));
	// One row has nothing above it, so every filter reads only leftwards
	const left = (i: number) => (i >= channels ? line[i - channels] : 0);
	for (let i = 0; i < line.length; i++)
		line[i] =
			(line[i] +
				(filter === 1 || filter === 4
					? left(i)
					: filter === 3
						? left(i) >> 1
						: 0)) &
			255;
	return Array.from({ length: width }, (_, i) => [
		line[i * channels],
		line[i * channels + 1],
		line[i * channels + 2],
	]);
};

/** One pixel of the first svg on the page, in the svg's own pixels. */
const pixelIn =
	(page: Page, root = "svg") =>
	async (x: number, y: number): Promise<Rgb> => {
		const origin = await page.evaluate((within) => {
			const r = (
				document.querySelector(within) as Element
			).getBoundingClientRect();
			return { x: r.x, y: r.y };
		}, root);
		return (await rowAt(page, origin.x + x, origin.y + y, 1))[0];
	};

const RED: Rgb = [255, 0, 0];
const WHITE: Rgb = [255, 255, 255];
const red = (id: string, props: N = {}): N =>
	rect(id, { x: 0, y: 0, width: 100, height: 20, fill: "#ff0000", ...props });
const clipOf = (children: N[], props: N = {}, type = "Clip"): N => ({
	type,
	id: "c",
	props,
	children,
});
const windowRect = (props: N = {}): N =>
	rect("window", { x: 0, y: 0, width: 100, height: 20, ...props });
const move = (id: string, target: string, props: N): N => ({
	type: "Motion",
	id,
	props,
	children: [ref(target)],
});
// Holds the canvas open: content only counts where its clip can show it
const room = (width: number, height: number): N =>
	rect("room", { x: 0, y: 0, width, height, fill: "none" });
const openWindow = move("open", "window", {
	from: { width: 0 },
	steps: [{ to: { width: 100 }, over: 1, ease: "linear" }],
});

test("a clip whose shape widens wipes its content on", async ({ page }) => {
	await page.setContent(
		svgOf([clipOf([windowRect(), red("inside")]), openWindow]),
	);
	const pixel = pixelIn(page);
	await seek(page, 0);
	expect(await pixel(10, 10)).toEqual(WHITE);
	await seek(page, 0.5);
	expect(await pixel(40, 10)).toEqual(RED);
	expect(await pixel(60, 10)).toEqual(WHITE);
	await seek(page, 1);
	expect(await pixel(95, 10)).toEqual(RED);
	// The shape itself is never drawn, and takes no room
	expect(await page.locator("svg > rect").count()).toBe(0);
});

test("an iris opens about the centre of its circle", async ({ page }) => {
	await page.setContent(
		svgOf([
			room(100, 100),
			clipOf([
				{ type: "Circle", id: "hole", props: { cx: 50, cy: 50, r: 40 } },
				red("inside", { height: 100 }),
			]),
			{
				type: "Enter",
				id: "open",
				props: { from: { scale: 0 }, over: 1, ease: "linear" },
				children: [ref("hole")],
			},
		]),
	);
	const pixel = pixelIn(page);
	await seek(page, 0.5);
	// Half open: a circle of radius 20 round (50, 50)
	for (const [dx, dy] of [
		[1, 0],
		[-1, 0],
		[0, 1],
		[0, -1],
	]) {
		expect(await pixel(50 + dx * 16, 50 + dy * 16)).toEqual(RED);
		expect(await pixel(50 + dx * 24, 50 + dy * 24)).toEqual(WHITE);
	}
	await seek(page, 1);
	expect(await pixel(50 + 36, 50)).toEqual(RED);
	expect(await pixel(50, 50 - 36)).toEqual(RED);
});

test("an inverse clip shows what is outside its shape", async ({ page }) => {
	await page.setContent(
		svgOf([
			clipOf([windowRect({ width: 40 }), red("inside")], { inverse: true }),
		]),
	);
	const pixel = pixelIn(page);
	expect(await pixel(20, 10)).toEqual(WHITE);
	expect(await pixel(38, 10)).toEqual(WHITE);
	expect(await pixel(42, 10)).toEqual(RED);
	expect(await pixel(90, 10)).toEqual(RED);
});

test("a feather fades the content across the edge of the shape", async ({
	page,
}) => {
	await page.setContent(
		svgOf([
			room(100, 100),
			clipOf(
				[
					windowRect({ width: 50, height: 100 }),
					red("inside", { height: 100 }),
				],
				{ feather: 8 },
			),
		]),
	);
	const origin = await page.evaluate(() => {
		const r = (
			document.querySelector("svg") as Element
		).getBoundingClientRect();
		return { x: r.x, y: r.y };
	});
	// Red over white: green rises as the red goes
	const green = (await rowAt(page, origin.x + 25, origin.y + 50, 50)).map(
		(p) => p[1],
	);
	expect(green[0]).toBeLessThan(8);
	expect(green[49]).toBeGreaterThan(247);
	expect(green[25]).toBeGreaterThan(100);
	expect(green[25]).toBeLessThan(155);
	for (let i = 1; i < green.length; i++)
		expect(green[i]).toBeGreaterThanOrEqual(green[i - 1] - 1);
	// A slope, not a step
	expect(green.filter((g) => g > 25 && g < 230).length).toBeGreaterThan(12);
});

test("a mask shows its content through the opacity of its shape", async ({
	page,
}) => {
	await page.setContent(
		svgOf([
			clipOf(
				[windowRect({ fill: "#000000", width: 60 }), red("inside")],
				{},
				"Mask",
			),
			{
				type: "Exit",
				id: "fade",
				props: { over: 1, ease: "linear" },
				children: [ref("window")],
			},
		]),
	);
	const pixel = pixelIn(page);
	await seek(page, 0);
	expect(await pixel(30, 10)).toEqual(RED);
	expect(await pixel(80, 10)).toEqual(WHITE);
	await seek(page, 0.5);
	const half = await pixel(30, 10);
	expect(half[0]).toBe(255);
	expect(half[1]).toBeGreaterThan(118);
	expect(half[1]).toBeLessThan(138);
	await seek(page, 1);
	expect(await pixel(30, 10)).toEqual(WHITE);

	// By luminance, white shows and black hides
	await page.setContent(
		svgOf([
			clipOf(
				[
					{
						type: "Group",
						id: "shape",
						children: [
							windowRect({ fill: "#ffffff" }),
							rect("hide", { x: 0, y: 0, width: 50, height: 20, fill: "#000" }),
						],
					},
					red("inside"),
				],
				{ by: "luminance" },
				"Mask",
			),
		]),
	);
	expect(await pixelIn(page)(25, 10)).toEqual(WHITE);
	expect(await pixelIn(page)(75, 10)).toEqual(RED);
});

test("a Modulate resizes the window of a clip, and moves content under it", async ({
	page,
}) => {
	await page.setContent(
		svgOf([
			rect("wide", { x: 0, y: 30, width: 100, height: 4, fill: "#0000ff" }),
			clipOf([windowRect({ width: 20 }), red("inside")]),
			{
				type: "Modulate",
				id: "grow",
				props: { at: 0, over: 1, ease: "linear" },
				children: [{ type: "Span", children: [ref("wide"), ref("window")] }],
			},
		]),
	);
	const pixel = pixelIn(page);
	await seek(page, 0);
	expect(await pixel(10, 10)).toEqual(RED);
	expect(await pixel(30, 10)).toEqual(WHITE);
	await seek(page, 0.5);
	expect(await pixel(50, 10)).toEqual(RED);
	expect(await pixel(70, 10)).toEqual(WHITE);
	await seek(page, 1);
	expect(await pixel(95, 10)).toEqual(RED);

	// Content that a Modulate moves is cut where the window is, not where it was
	await page.setContent(
		svgOf([
			rect("post", { x: 60, y: 30, width: 10, height: 4, fill: "#0000ff" }),
			clipOf([windowRect(), red("inside", { width: 30 })]),
			{
				type: "Modulate",
				id: "shift",
				props: { at: 0, over: 1, ease: "linear" },
				children: [
					{
						type: "Align",
						props: { alignment: "left" },
						children: [ref("post"), ref("inside")],
					},
				],
			},
		]),
	);
	await seek(page, 1);
	const after = pixelIn(page);
	expect(await after(10, 10)).toEqual(WHITE);
	expect(await after(75, 10)).toEqual(RED);
});

test("a wipe plays backwards in a retrograde phrase", async ({ page }) => {
	await page.setContent(
		svgOf([
			clipOf([windowRect(), red("inside")]),
			openWindow,
			{
				type: "Phrase",
				id: "back",
				props: { retrograde: true },
				children: [ref("open")],
			},
		]),
	);
	const pixel = pixelIn(page);
	await seek(page, 0);
	expect(await pixel(95, 10)).toEqual(RED);
	await seek(page, 0.5);
	expect(await pixel(40, 10)).toEqual(RED);
	expect(await pixel(60, 10)).toEqual(WHITE);
	await seek(page, 1);
	expect(await pixel(5, 10)).toEqual(WHITE);
});

test("reduced motion shows a clip as the still frame has it", async ({
	page,
}) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	// Closing: the still is the last frame, which only the stylesheet shows
	await page.setContent(
		svgOf([
			clipOf([windowRect(), red("inside")]),
			move("close", "window", {
				steps: [{ to: { width: 30 }, over: 1, ease: "linear" }],
			}),
		]),
	);
	await page.waitForTimeout(100);
	const pixel = pixelIn(page);
	expect(await pixel(20, 10)).toEqual(RED);
	expect(await pixel(40, 10)).toEqual(WHITE);
	expect(
		await page.evaluate(
			() =>
				document.getAnimations().filter((a) => a.playState === "running")
					.length,
		),
	).toBe(0);
});

test("a crop cuts a mark by its own box, and leaves its stroke at 0", async ({
	page,
}) => {
	await page.setContent(
		svgOf([
			rect("a", {
				x: 2,
				y: 2,
				width: 100,
				height: 20,
				fill: "#ff0000",
				stroke: "#0000ff",
				"stroke-width": 4,
			}),
			move("wipe", "a", {
				from: { cropRight: 0.5, cropTop: 0.5 },
				steps: [{ to: { cropRight: 0, cropTop: 0 }, over: 1, ease: "linear" }],
			}),
		]),
	);
	const pixel = pixelIn(page);
	await seek(page, 0);
	// The stroke box is 104 by 24: cut at its middle, both ways
	expect(await pixel(40, 18)).toEqual(RED);
	expect(await pixel(50, 18)).toEqual(RED);
	expect(await pixel(54, 18)).toEqual(WHITE);
	expect(await pixel(40, 10)).toEqual(WHITE);
	expect(await pixel(40, 14)).toEqual(RED);
	await seek(page, 1);
	expect(await pixel(90, 6)).toEqual(RED);
	// The outer half of the stroke lies outside the box and is still drawn
	expect(await pixel(103, 12)).toEqual([0, 0, 255]);
	expect(await pixel(50, 1)).toEqual([0, 0, 255]);
});

test("a motion on a clip takes the cut and the content along as one", async ({
	page,
}) => {
	await page.setContent(
		svgOf([
			rect("room", { x: 0, y: 0, width: 200, height: 20, fill: "none" }),
			clipOf([windowRect({ width: 40 }), red("inside")]),
			move("slide", "c", {
				steps: [{ to: { x: 100, opacity: 0.5 }, over: 1, ease: "linear" }],
			}),
		]),
	);
	const pixel = pixelIn(page);
	await seek(page, 1);
	expect(await pixel(20, 10)).toEqual(WHITE);
	const moved = await pixel(120, 10);
	expect(moved[0]).toBe(255);
	expect(moved[1]).toBeGreaterThan(120);
	expect(moved[1]).toBeLessThan(135);
	// Still cut 40 wide
	expect(await pixel(145, 10)).toEqual(WHITE);
});

test("a spring Travel on a smooth route carries the window of a mask", async ({
	page,
}) => {
	const stop = (id: string, x: number, y: number): N =>
		rect(id, { x, y, width: 10, height: 10, fill: "none" });
	await page.setContent(
		svgOf([
			rect("floor", { x: 0, y: 0, width: 200, height: 120, fill: "#ff0000" }),
			stop("bend", 95, 100),
			stop("far", 180, 5),
			clipOf(
				[
					{
						type: "Circle",
						id: "spot",
						props: { cx: 15, cy: 15, r: 12, fill: "#000", stroke: "none" },
					},
					rect("lit", { x: 0, y: 0, width: 200, height: 120, fill: "#00ff00" }),
				],
				{},
				"Mask",
			),
			{
				type: "Travel",
				id: "go",
				props: { route: "smooth", over: 2, ease: "spring" },
				children: [ref("spot"), ref("bend"), ref("far")],
			},
		]),
	);
	const pixel = pixelIn(page);
	const GREEN: Rgb = [0, 255, 0];
	await seek(page, 0);
	expect(await pixel(15, 15)).toEqual(GREEN);
	expect(await pixel(185, 10)).toEqual(RED);
	await seek(page, 2);
	expect(await pixel(185, 10)).toEqual(GREEN);
	expect(await pixel(15, 15)).toEqual(RED);
	// On the way it rounds the bend
	const seen: boolean[] = [];
	for (let t = 0.02; t < 0.8; t += 0.01) {
		await seek(page, t);
		seen.push((await pixel(100, 105))[1] === 255);
	}
	expect(seen).toContain(true);
});

test("a clip zooms with the camera's view", async ({ page }) => {
	const scene = buildSceneFromJson({
		type: "Group",
		id: "root",
		children: [
			rect("stage", { x: 0, y: 0, width: 200, height: 100, fill: "none" }),
			{
				type: "Clip",
				id: "c",
				children: [
					rect("window", { x: 80, y: 40, width: 20, height: 10 }),
					rect("inside", {
						x: 0,
						y: 0,
						width: 200,
						height: 100,
						fill: "#ff0000",
					}),
				],
			},
			{
				type: "Camera",
				id: "push",
				props: { at: 0, over: 1, ease: "linear" },
				children: [ref("window")],
			},
		],
	});
	await page.setContent(
		layoutToSvg(solveLayout(scene), scene.nodes, 0, {
			view: { width: 200, height: 100 },
		}),
	);
	const pixel = pixelIn(page);
	await seek(page, 0);
	expect(await pixel(90, 45)).toEqual(RED);
	expect(await pixel(70, 45)).toEqual(WHITE);
	expect(await pixel(110, 45)).toEqual(WHITE);
	// Framed, the 20 by 10 window fills the 200 by 100 view
	await seek(page, 1);
	for (const [x, y] of [
		[5, 5],
		[195, 5],
		[5, 95],
		[195, 95],
		[100, 50],
	])
		expect(await pixel(x, y)).toEqual(RED);
});

const mountClips = async (page: Page) => {
	const fixture = fileURLToPath(
		new URL("./fixtures/clip.tsx", import.meta.url),
	);
	await page.goto("http://localhost:5173/");
	await page.addScriptTag({ type: "module", url: `/@fs${fixture}` });
	await page.waitForFunction(() => "mount" in window);
	await page.evaluate(() => (window as never as { mount: () => void }).mount());
	await page.waitForSelector("#state svg #inside");
	const hold = (which: string, t: number | undefined) =>
		page.evaluate(
			([graphic, time]) =>
				(
					window as never as {
						hold: (which: string, t?: number) => void;
					}
				).hold(graphic as string, (time as number | null) ?? undefined),
			[which, t ?? null] as const,
		);
	return { hold, pixel: (graphic: string) => pixelIn(page, `#${graphic} svg`) };
};

test("Graphic's playhead holds a wipe, and two Graphics of one scene keep their own mattes", async ({
	page,
}) => {
	const { hold, pixel } = await mountClips(page);
	await hold("one", 0.5);
	await hold("two", 1.5);
	// A quarter open, and three quarters
	await expect.poll(() => pixel("one")(20, 10)).toEqual(RED);
	expect(await pixel("one")(30, 10)).toEqual(WHITE);
	await expect.poll(() => pixel("two")(70, 10)).toEqual(RED);
	expect(await pixel("two")(80, 10)).toEqual(WHITE);
	const ids = await page.evaluate(() =>
		[...document.querySelectorAll("#clips mask")].map((m) => m.id),
	);
	expect(new Set(ids).size).toBe(3);
	await hold("one", 2);
	await expect.poll(() => pixel("one")(95, 10)).toEqual(RED);
	// The other one did not move
	expect(await pixel("two")(80, 10)).toEqual(WHITE);
});

test("Graphic's transition tweens the shape of a clip", async ({ page }) => {
	const { pixel } = await mountClips(page);
	const at = pixel("state");
	expect(await at(10, 10)).toEqual(RED);
	expect(await at(30, 10)).toEqual(WHITE);
	await page.evaluate(() =>
		(window as never as { open: (w: number) => void }).open(100),
	);
	// Part of the way there before it is all the way
	const seen: boolean[] = [];
	for (let i = 0; i < 10; i++) {
		await page.waitForTimeout(40);
		seen.push((await at(90, 10))[1] === 0);
	}
	expect(seen[0]).toBe(false);
	await page.waitForTimeout(500);
	expect(await at(90, 10)).toEqual(RED);
	// Closing, the matte keeps room for where the window comes from
	await page.evaluate(() =>
		(window as never as { open: (w: number) => void }).open(20),
	);
	await page.waitForTimeout(60);
	expect(await at(50, 10)).toEqual(RED);
	await page.waitForTimeout(900);
	expect(await at(50, 10)).toEqual(WHITE);
	expect(await at(10, 10)).toEqual(RED);
});

test("the Ticker example stays the size of its bar while the strip rolls through", async ({
	page,
}) => {
	await page.goto("http://localhost:5173/animation/");
	const svg = page.locator("main svg:has([id='acme0Symbol'])");
	await svg.waitFor();
	expect(await svg.getAttribute("width")).toBe("480");
	expect(await svg.getAttribute("height")).toBe("44");
	const at = exampleAt(page, "acme0Symbol");
	const first = (await at(0, ["acme0Symbol", "acme1Symbol"])).acme0Symbol;
	// One lap on, the second lap's quote is where the first one's was
	const lapped = (await at(8.999, ["acme0Symbol", "acme1Symbol"])).acme1Symbol;
	expect(lapped.x).toBeCloseTo(first.x, 0);
});

test("the Title card example brings the name up from behind the rule", async ({
	page,
}) => {
	await page.goto("http://localhost:5173/animation/");
	const svg = page.locator("main svg:has([id='rule'])");
	await svg.waitFor();
	await svg.scrollIntoViewIfNeeded();
	const at = exampleAt(page, "rule");
	const rest = (await at(2.5, ["name", "rule"])).name;
	const rising = (await at(0.75, ["name"])).name;
	expect(rising.y).toBeGreaterThan(rest.y + 20);
	// Still under the rule there: nothing of the name is painted below it
	const box = await svg.boundingBox();
	const rule = (await at(0.75, ["rule"])).rule;
	const below = await rowAt(
		page,
		(box?.x ?? 0) + 34,
		(box?.y ?? 0) + rule.y + 6,
		150,
	);
	expect(below.every((p) => p[0] < 60)).toBe(true);
	const above = await rowAt(
		page,
		(box?.x ?? 0) + 34,
		(box?.y ?? 0) + rule.y - 6,
		150,
	);
	expect(above.some((p) => p[0] > 200)).toBe(true);
});

test("the Before and after example cuts both charts on the handle", async ({
	page,
}) => {
	await page.goto("http://localhost:5173/animation/");
	const svg = page.locator("main svg:has([id='knob'])");
	await svg.waitFor();
	await svg.scrollIntoViewIfNeeded();
	const at = exampleAt(page, "knob");
	const box = await svg.boundingBox();
	for (const t of [0.4, 1.8, 4.7]) {
		const { knob } = await at(t, ["knob"]);
		// The designed chart's blue or orange bars left of the line, the
		// draft's grey ones right of it; sampled low, where every bar is
		const y = (box?.y ?? 0) + 185;
		const row = await rowAt(page, box?.x ?? 0, y, Math.round(box?.width ?? 0));
		const grey = (p: Rgb) =>
			Math.abs(p[0] - p[1]) < 6 && Math.abs(p[1] - p[2]) < 6 && p[0] < 200;
		const vivid = (p: Rgb) => Math.max(...p) - Math.min(...p) > 80;
		const cut = Math.round(knob.x);
		expect(row.slice(0, cut - 3).some(grey), `left at ${t}`).toBe(false);
		expect(row.slice(cut + 3).some(vivid), `right at ${t}`).toBe(false);
		expect(row.slice(0, cut - 3).some(vivid), `left at ${t}`).toBe(true);
		expect(row.slice(cut + 3).some(grey), `right at ${t}`).toBe(true);
	}
});

// --- what a review of springs, the camera and clips found -------------------------

const svgIn = (
	children: N[],
	opts: Parameters<typeof layoutToSvg>[3] = {},
): string => {
	const scene = buildSceneFromJson({ type: "Group", id: "root", children });
	return layoutToSvg(solveLayout(scene), scene.nodes, 0, opts);
};

/** The furthest a mark's centre gets from the middle of the picture, seeking through a span. */
const strays = (page: Page, id: string, from: number, to: number) =>
	page.evaluate(
		([mark, t0, t1]) => {
			const svg = document.querySelector("svg") as SVGSVGElement;
			const el = svg.querySelector(`[id="${mark}"]`) as Element;
			const animations = document.getAnimations();
			for (const a of animations) a.pause();
			let worst = 0;
			let at = 0;
			for (let t = Number(t0); t <= Number(t1); t += 0.005) {
				for (const a of animations) a.currentTime = t * 1000;
				const [m, s] = [
					el.getBoundingClientRect(),
					svg.getBoundingClientRect(),
				];
				const off = Math.hypot(
					m.x + m.width / 2 - (s.x + s.width / 2),
					m.y + m.height / 2 - (s.y + s.height / 2),
				);
				if (off > worst) [worst, at] = [off, t];
			}
			return { worst, at };
		},
		[id, from, to] as const,
	);

test("a camera keeps a mark in the middle while a spring, a bounce or a bezier moves it", async ({
	page,
}) => {
	for (const ease of ["bounce", "spring", "elastic", "inOut", "out"]) {
		await page.setContent(
			svgIn([
				dot("a", 5, 5),
				dot("b", 305, 105),
				dot("m", 5, 5),
				on("Enter", "slide", "m", { at: 1, over: 1, from: { x: -200 }, ease }),
				camera("cam", { at: 0, over: 0, follow: true, padding: 10 }, "m"),
			]),
		);
		const { worst, at } = await strays(page, "m", 0.9, 2.1);
		expect(worst, `${ease} at ${at}`).toBeLessThan(1);
	}
	// The same through layout, with nothing told to follow
	for (const ease of ["elastic", "spring", "inOut"]) {
		await page.setContent(
			svgIn([
				{
					type: "StackH",
					id: "row",
					props: { spacing: 10 },
					children: [dot("p", 0, 0), dot("q", 0, 0), dot("m", 0, 0)],
				},
				{
					type: "Modulate",
					id: "spread",
					props: { at: 1, over: 1, ease },
					children: [
						{
							type: "StackH",
							props: { spacing: 100 },
							children: ["p", "q", "m"].map(ref),
						},
					],
				},
				camera("cam", { at: 0, over: 0, padding: 10 }, "m"),
			]),
		);
		const { worst, at } = await strays(page, "m", 0.9, 2.1);
		expect(worst, `Modulate ${ease} at ${at}`).toBeLessThan(1);
	}
});

/** The pixels of a part of the page as rows of luminance. */
const lumaOf = async (
	page: Page,
	clip: { x: number; y: number; width: number; height: number },
): Promise<number[][]> => {
	const png = await page.screenshot({ clip });
	const chunks: Buffer[] = [];
	let [width, height, channels] = [0, 0, 4];
	for (let at = 8; at < png.length; ) {
		const length = png.readUInt32BE(at);
		const type = png.toString("latin1", at + 4, at + 8);
		const data = png.subarray(at + 8, at + 8 + length);
		if (type === "IHDR") {
			width = data.readUInt32BE(0);
			height = data.readUInt32BE(4);
			channels = data[9] === 6 ? 4 : 3;
		}
		if (type === "IDAT") chunks.push(data);
		at += length + 12;
	}
	const raw = inflateSync(Buffer.concat(chunks));
	const stride = width * channels;
	const rows: number[][] = [];
	let above = new Uint8Array(stride);
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)];
		const line = Uint8Array.from(
			raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)),
		);
		for (let i = 0; i < stride; i++) {
			const [a, b, c] = [
				i >= channels ? line[i - channels] : 0,
				above[i],
				i >= channels ? above[i - channels] : 0,
			];
			const p = a + b - c;
			const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
			const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
			line[i] += [0, a, b, (a + b) >> 1, paeth][filter] ?? 0;
		}
		rows.push(
			Array.from(
				{ length: width },
				(_, x) =>
					0.299 * line[x * channels] +
					0.587 * line[x * channels + 1] +
					0.114 * line[x * channels + 2],
			),
		);
		above = line;
	}
	return rows;
};

/** How crisp edges are: the mean of the strongest 2% of steps between neighbours in a row. */
const sharpness = (rows: number[][]): number => {
	const steps = rows
		.flatMap((row) => row.slice(1).map((v, i) => Math.abs(v - row[i])))
		.sort((a, b) => b - a);
	const top = steps.slice(0, Math.max(1, Math.round(steps.length * 0.02)));
	return top.reduce((a, b) => a + b, 0) / top.length;
};

test("a zoomed view is as sharp while it plays as when it is held, with a clip in the scene", async ({
	page,
}) => {
	const scene = (clipped: boolean): N[] => [
		rect("room", { x: 0, y: 0, width: 400, height: 200, fill: "none" }),
		{
			type: "Text",
			id: "free",
			props: { x: 172, y: 100, "font-size": 9, text: "not clipped" },
		},
		rect("line", { x: 172, y: 96, width: 50, height: 0.4, fill: "black" }),
		...(clipped
			? [
					clipOf([
						rect("win", { x: 190, y: 112, width: 20, height: 4 }),
						rect("in", {
							x: 185,
							y: 110,
							width: 30,
							height: 8,
							fill: "#ffb0b0",
						}),
					]),
				]
			: []),
		{ type: "Rest", id: "hold", props: { at: 0, over: 4 } },
		camera("cam", { at: 0.3, over: 0, padding: 14 }, "free"),
	];
	const measure = async (clipped: boolean) => {
		await page.setContent(svgIn(scene(clipped)));
		const box = (await page.locator("svg").boundingBox()) ?? {
			x: 0,
			y: 0,
			width: 400,
			height: 200,
		};
		await page.waitForTimeout(1500);
		const live = sharpness(await lumaOf(page, box));
		await page.evaluate(() => {
			for (const a of document.getAnimations()) a.pause();
		});
		await page.waitForTimeout(100);
		const held = sharpness(await lumaOf(page, box));
		return { live, held };
	};
	const plain = await measure(false);
	const clipped = await measure(true);
	// The clip costs the unclipped text nothing, playing or held
	expect(clipped.live).toBeGreaterThan(plain.live * 0.85);
	expect(clipped.live).toBeGreaterThan(clipped.held * 0.6);
});

test("an inverse clip shows content beyond the canvas wherever the viewport does", async ({
	page,
}) => {
	await page.setContent(
		svgIn(
			[
				rect("room", { x: 0, y: 0, width: 200, height: 50, fill: "none" }),
				clipOf(
					[
						dot("hole", 100, 25, 10),
						rect("card", {
							x: 60,
							y: 10,
							width: 80,
							height: 30,
							fill: "#ff0000",
						}),
					],
					{ inverse: true },
				),
				on("Enter", "drop", "card", {
					from: { y: -150 },
					over: 1,
					ease: "linear",
				}),
			],
			{ view: { width: 200, height: 400 } },
		),
	);
	const pixel = pixelIn(page);
	// The canvas sits in the middle of the tall view: y 175 to 225
	for (const t of [0, 0.2, 0.5]) {
		await seek(page, t);
		const y = 175 + 10 - 150 * (1 - t) + 15;
		expect(await pixel(70, y), `card at ${t}`).toEqual(RED);
	}
	await seek(page, 1);
	expect(await pixel(70, 200)).toEqual(RED);
	expect(await pixel(100, 200)).toEqual(WHITE);
});

test("an oriented mover rests on the tangent at both ends of a curved route", async ({
	page,
}) => {
	await page.setContent(
		svgIn([
			rect("room", { x: 0, y: 0, width: 100, height: 100, fill: "none" }),
			{
				type: "Arc",
				id: "arc",
				props: {
					x: 30,
					y: 30,
					r: 12,
					startAngle: 0,
					endAngle: 180,
					fill: "none",
				},
			},
			rect("mover", { x: 0, y: 0, width: 10, height: 2 }),
			{
				type: "Travel",
				id: "trip",
				props: {
					at: 0.5,
					over: 1,
					ease: "linear",
					route: "along",
					orient: true,
				},
				children: [ref("mover"), ref("arc")],
			},
		]),
	);
	const heading = () =>
		page.evaluate(() => {
			const m = (
				document.querySelector("#mover") as SVGGraphicsElement
			).getScreenCTM() as DOMMatrix;
			return (Math.atan2(m.b, m.a) * 180) / Math.PI;
		});
	await seek(page, 0.2);
	expect(Math.abs(await heading())).toBeLessThan(0.5);
	await seek(page, 1);
	expect(Math.abs((await heading()) - 90)).toBeLessThan(0.5);
	await seek(page, 1.8);
	expect(Math.abs(Math.abs(await heading()) - 180)).toBeLessThan(0.5);
});
