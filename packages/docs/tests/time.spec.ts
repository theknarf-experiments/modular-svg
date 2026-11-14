import { fileURLToPath } from "node:url";
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
