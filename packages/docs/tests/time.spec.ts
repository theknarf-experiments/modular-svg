import { expect, type Page, test } from "@playwright/test";
import {
	buildSceneFromJson,
	layoutToSvg,
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
	// as wide as the box it spans, on the centre of that box
	expect(grown.left).toBeCloseTo(wide.left, 1);
	expect(grown.right).toBeCloseTo(wide.right, 1);
	expect((grown.top + grown.bottom) / 2).toBeCloseTo(
		(small.top + small.bottom) / 2,
		1,
	);

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
