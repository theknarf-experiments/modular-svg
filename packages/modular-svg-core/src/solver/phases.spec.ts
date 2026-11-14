import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildSceneFromJson, checkSolution } from "../parser.ts";
import type { LayoutOperator } from "./operators.ts";
import { foldPhases, lerpBoxes, phaseBoxes } from "./phases.ts";
import { type LayoutResult, solveLayout } from "./solver.ts";

type N = Record<string, unknown>;
const ref = (target: string): N => ({ type: "Ref", target });
const rect = (id: string, props: N = {}): N => ({
	type: "Rect",
	id,
	props: { width: 20, height: 10, ...props },
});
const rel = (type: string, id: string, ids: string[], props: N = {}): N => ({
	type,
	id,
	props,
	children: ids.map(ref),
});
const modulate = (id: string, children: N[], props: N = {}): N => ({
	type: "Modulate",
	id,
	props,
	children,
});
const resolve = (id: string, props: N = {}, ids: string[] = []): N => ({
	type: "Resolve",
	id,
	props,
	children: ids.map(ref),
});

const solve = (children: N[]) => {
	const scene = buildSceneFromJson({ type: "Group", id: "root", children });
	return { scene, layout: solveLayout(scene) };
};
/** Where a node is once `event` has played (home when it does not move it). */
const boxAfter = (layout: LayoutResult, id: string, event: string) => {
	const { x, y, width, height } = layout[id].phases?.[event] ?? layout[id];
	return { x, y, width, height };
};
const home = (layout: LayoutResult, id: string) => {
	const { x, y, width, height } = layout[id];
	return { x, y, width, height };
};
const near = (b: { x: number; y: number; width: number; height: number }) => ({
	x: expect.closeTo(b.x, 3),
	y: expect.closeTo(b.y, 3),
	width: expect.closeTo(b.width, 3),
	height: expect.closeTo(b.height, 3),
});

const list = (ids: string[]): N => ({
	type: "StackV",
	id: "list",
	props: { spacing: 8 },
	children: ids.map((id) => rect(id)),
});

describe("phases", () => {
	it("reorders a stack in place: the list keeps its box, the slots permute", () => {
		const { scene, layout } = solve([
			list(["a", "b", "c"]),
			modulate("shuffle", [
				rel("StackV", "order", ["c", "a", "b"], { spacing: 8 }),
			]),
		]);
		expect(scene.warnings).toEqual([]);
		expect(layout.list.phases).toBeUndefined();
		expect(boxAfter(layout, "c", "shuffle")).toEqual(near(home(layout, "a")));
		expect(boxAfter(layout, "a", "shuffle")).toEqual(near(home(layout, "b")));
		expect(boxAfter(layout, "b", "shuffle")).toEqual(near(home(layout, "c")));
		// home is still what the layout itself says
		expect(layout.a.y).toBeLessThan(layout.b.y);
	});

	it("makes room: the modulation closes the gap and Resolve returns exactly home", () => {
		const { layout } = solve([
			list(["a", "b", "c", "d"]),
			modulate(
				"without",
				[rel("StackV", "rest", ["a", "b", "d"], { spacing: 8 })],
				{
					at: 0,
					over: 0,
				},
			),
			resolve("part", { at: 1 }),
		]);
		expect(boxAfter(layout, "d", "without").y).toBeCloseTo(layout.c.y, 3);
		expect(layout.a.phases).toBeUndefined();
		// the list shrinks around what is left
		expect(boxAfter(layout, "list", "without").height).toBeCloseTo(
			layout.list.height - layout.d.height - 8,
			3,
		);
		expect(layout.d.phases?.part).toEqual(home(layout, "d"));
		expect(layout.list.phases?.part).toEqual(home(layout, "list"));
	});

	const handoff = (extra: N[] = []) =>
		solve([
			{
				type: "StackH",
				id: "row",
				props: { spacing: 30 },
				children: [rect("s1"), rect("s2"), rect("s3")],
			},
			rect("job", { width: 8, height: 4 }),
			rel("Align", "seat", ["s1", "job"], { alignment: "center" }),
			modulate("hop", [
				rel("Align", "seat3", ["s3", "job"], { alignment: "center" }),
			]),
			...extra,
		]);

	it("supersedes only the relation that placed a moved box; the row stays", () => {
		const { scene, layout } = handoff();
		expect(scene.warnings).toEqual([]);
		for (const id of ["s1", "s2", "s3", "row"])
			expect(layout[id].phases).toBeUndefined();
		const job = boxAfter(layout, "job", "hop");
		expect(job.x + job.width / 2).toBeCloseTo(layout.s3.x + 10, 3);
		expect(layout.job.x + 4).toBeCloseTo(layout.s1.x + 10, 3);
	});

	it("lets a later modulation win, and restores the earlier one when it resolves", () => {
		const { layout } = handoff([
			modulate(
				"hop2",
				[rel("Align", "seat2", ["s2", "job"], { alignment: "center" })],
				{ at: 1 },
			),
			resolve("back", { at: 2 }, ["hop2"]),
			resolve("done", { at: 3 }),
		]);
		const center = (event: string) => {
			const b = boxAfter(layout, "job", event);
			return b.x + b.width / 2;
		};
		expect(center("hop2")).toBeCloseTo(layout.s2.x + 10, 3);
		expect(layout.job.phases?.back).toEqual(layout.job.phases?.hop);
		expect(layout.job.phases?.done).toEqual(home(layout, "job"));
	});

	it("leaves members a superseded relation no longer places at home", () => {
		const { layout } = solve([
			list(["a", "b", "c"]),
			modulate("pair", [rel("StackV", "two", ["b", "a"], { spacing: 8 })]),
		]);
		expect(layout.c.phases).toBeUndefined();
		expect(boxAfter(layout, "b", "pair").y).toBeCloseTo(layout.a.y, 3);
	});

	it("resizes what a restated stack sized when the modulation gives another total", () => {
		const row = (total: number, id = "row"): N => ({
			type: "StackH",
			id,
			props: { spacing: 10, total },
			children: ["a", "b", "c"].map((r) => ({
				type: "Rect",
				id: r,
				props: { height: 10 },
			})),
		});
		const wide = solve([row(200)]).layout;
		const { scene, layout } = solve([
			row(100),
			modulate("m", [
				rel("StackH", "o", ["a", "b", "c"], { spacing: 10, total: 200 }),
			]),
		]);
		expect(scene.warnings).toEqual([]);
		expect(checkSolution(scene, layout)).toEqual([]);
		expect(wide.a.width).toBeGreaterThan(layout.a.width + 10);
		for (const id of ["a", "b", "c", "row"])
			expect(boxAfter(layout, id, "m").width).toBeCloseTo(wide[id].width, 3);
	});

	it("keeps the sizes of a restated stack when the modulation only reorders it", () => {
		const { scene, layout } = solve([
			{
				type: "StackH",
				id: "row",
				props: { spacing: 10, total: 100 },
				children: ["a", "b", "c"].map((r) => ({
					type: "Rect",
					id: r,
					props: { height: 10 },
				})),
			},
			modulate("m", [rel("StackH", "o", ["c", "a", "b"], { spacing: 10 })]),
		]);
		expect(scene.warnings).toEqual([]);
		expect(boxAfter(layout, "c", "m")).toEqual(near(home(layout, "a")));
		expect(layout.row.phases).toBeUndefined();
	});

	const wrap = (id: string, children: N[], props: N = {}): N => ({
		type: "Background",
		id,
		props,
		children,
	});
	const wraps =
		(box: ReturnType<typeof home>, around: string[], pad: number) =>
		(layout: LayoutResult, event: string) => {
			const boxes = around.map((id) => boxAfter(layout, id, event));
			const left = Math.min(...boxes.map((b) => b.x));
			const top = Math.min(...boxes.map((b) => b.y));
			const right = Math.max(...boxes.map((b) => b.x + b.width));
			const bottom = Math.max(...boxes.map((b) => b.y + b.height));
			expect(box).toEqual(
				near({
					x: left - pad,
					y: top - pad,
					width: right - left + pad * 2,
					height: bottom - top + pad * 2,
				}),
			);
		};

	it("rewraps a Background around other members while a Modulate holds", () => {
		const { scene, layout } = solve([
			list(["a", "b", "c"]),
			wrap("mark", [ref("a")], { padding: 3 }),
			modulate("grow", [
				wrap("wider", [ref("mark"), ref("a"), ref("b")], { padding: 3 }),
			]),
			modulate("slide", [wrap("next", [ref("mark"), ref("c")])], { at: 1 }),
			resolve("back", { at: 2 }, ["slide"]),
			resolve("done", { at: 3 }),
		]);
		expect(scene.warnings).toEqual([]);
		expect(checkSolution(scene, layout)).toEqual([]);
		wraps(home(layout, "mark"), ["a"], 3)(layout, "");
		wraps(boxAfter(layout, "mark", "grow"), ["a", "b"], 3)(layout, "grow");
		// the later one wins, with the default padding
		wraps(boxAfter(layout, "mark", "slide"), ["c"], 10)(layout, "slide");
		expect(layout.mark.phases?.back).toEqual(layout.mark.phases?.grow);
		expect(layout.mark.phases?.done).toEqual(home(layout, "mark"));
		for (const id of ["a", "b", "c", "list"])
			expect(layout[id].phases).toBeUndefined();
		// the Background inside the Modulate is a relation, not another box
		expect(scene.nodes.find((n) => n.id === "wider")?.type).toBeUndefined();
	});

	it("makes room for a Background whose padding a Modulate changes", () => {
		const { scene, layout } = solve([
			{
				type: "StackV",
				id: "list",
				props: { spacing: 8 },
				children: [wrap("card", [rect("a")], { padding: 5 }), rect("b")],
			},
			modulate("open", [
				wrap("roomy", [ref("card"), ref("a")], { padding: 15 }),
			]),
		]);
		expect(scene.warnings).toEqual([]);
		expect(checkSolution(scene, layout)).toEqual([]);
		// the card grows around what it wraps, and the stack makes room below
		const card = boxAfter(layout, "card", "open");
		expect(card.height).toBeCloseTo(layout.card.height + 20, 3);
		expect(card.y).toBeCloseTo(layout.card.y - 10, 3);
		expect(layout.a.phases).toBeUndefined();
		expect(boxAfter(layout, "b", "open").y).toBeCloseTo(layout.b.y + 10, 3);
	});

	it("lets a restated Background go from a stack that placed it elsewhere", () => {
		const { scene, layout } = solve([
			list(["a", "b"]),
			{
				type: "StackH",
				id: "side",
				props: { spacing: 40 },
				children: [ref("list"), wrap("note", [rect("n")], { padding: 2 })],
			},
			modulate("point", [wrap("at", [ref("note"), ref("b")], { padding: 2 })]),
		]);
		expect(scene.warnings).toEqual([]);
		expect(checkSolution(scene, layout)).toEqual([]);
		wraps(boxAfter(layout, "note", "point"), ["b"], 2)(layout, "point");
		expect(layout.n.phases).toBeUndefined();
	});

	it("warns when a home stack keeps placing what a restated Background now wraps", () => {
		const { scene, layout } = solve([
			{
				type: "StackH",
				id: "row",
				children: [wrap("box", [rect("a")]), rect("b"), rect("c")],
			},
			modulate("m", [wrap("both", [ref("box"), ref("a"), ref("b")])]),
		]);
		expect(scene.warnings).toEqual([
			"Modulate(m): background(box) now wraps b, which stackH(row) places beside box; restate that relation inside the Modulate",
		]);
		// restated, it holds
		const fixed = solve([
			{
				type: "StackH",
				id: "row",
				children: [wrap("box", [rect("a")]), rect("b"), rect("c")],
			},
			modulate("m", [
				rel("StackH", "tight", ["a", "b"], { spacing: 4 }),
				wrap("both", [ref("box"), ref("a"), ref("b")]),
				rel("StackH", "after", ["box", "c"]),
			]),
		]);
		expect(fixed.scene.warnings).toEqual([]);
		expect(checkSolution(fixed.scene, fixed.layout)).toEqual([]);
		wraps(
			boxAfter(fixed.layout, "box", "m"),
			["a", "b"],
			10,
		)(fixed.layout, "m");
		expect(layout.box.phases?.m).toBeDefined();
	});

	it("spans one box over another while a Modulate holds", () => {
		const { scene, layout } = solve([
			{
				type: "StackV",
				id: "col",
				props: { alignment: "left" },
				children: [rect("a"), rect("wide", { width: 50 })],
			},
			modulate("fit", [
				{
					type: "Span",
					id: "s",
					props: { axis: "x" },
					children: [ref("wide"), ref("a")],
				},
			]),
			resolve("back", { at: 1 }),
		]);
		expect(scene.warnings).toEqual([]);
		expect(checkSolution(scene, layout)).toEqual([]);
		expect(layout.a.width).toBe(20);
		expect(boxAfter(layout, "a", "fit").width).toBeCloseTo(50, 3);
		expect(boxAfter(layout, "a", "fit").x).toBeCloseTo(layout.wide.x, 3);
		expect(layout.a.phases?.back).toEqual(home(layout, "a"));
	});

	describe("a circle a Modulate spans on one axis", () => {
		const dotted = (inside: N[]): N[] => [
			{
				type: "StackV",
				id: "col",
				props: { alignment: "left", spacing: 40 },
				children: [
					{ type: "Circle", id: "dot", props: { r: 10 } },
					rect("wide", { width: 60 }),
				],
			},
			modulate("fit", inside),
		];
		const span = (axis: string, source = "wide"): N =>
			rel("Span", `s${axis}`, [source, "dot"], { axis });

		it("stays round, so its box holds what is drawn", () => {
			const { scene, layout } = solve(dotted([span("x")]));
			expect(scene.warnings).toEqual([]);
			expect(checkSolution(scene, layout)).toEqual([]);
			const dot = boxAfter(layout, "dot", "fit");
			expect(dot).toEqual(near({ x: 0, y: 0, width: 60, height: 60 }));
			// The Span took dot from the stack, which lets go: wide stays
			expect(boxAfter(layout, "wide", "fit")).toEqual(home(layout, "wide"));
		});

		it("takes each side from its own Span when both are given", () => {
			const { scene, layout } = solve([
				rect("tall", { x: 200, y: 0, width: 5, height: 30 }),
				...dotted([span("x"), span("y", "tall")]),
			]);
			expect(scene.warnings).toEqual([]);
			const dot = boxAfter(layout, "dot", "fit");
			expect([dot.width, dot.height]).toEqual([
				expect.closeTo(60, 3),
				expect.closeTo(30, 3),
			]);
		});
	});

	const columns = (): N => ({
		type: "StackH",
		id: "row",
		children: [
			{ type: "StackV", id: "colA", children: [rect("a"), rect("b")] },
			{ type: "StackV", id: "colB", children: [rect("c"), rect("d")] },
			{ type: "StackV", id: "colC", children: [rect("e"), rect("f")] },
		],
	});

	it("settles a stack over members of several containers: what placed those lets go", () => {
		const { scene, layout } = solve([
			columns(),
			modulate("m", [rel("StackV", "o", ["a", "c"], { spacing: 2 })]),
		]);
		expect(scene.warnings).toEqual([]);
		expect(checkSolution(scene, layout)).toEqual([]);
		// a stays, as the first that a relation this one does not restate placed
		const c = boxAfter(layout, "c", "m");
		expect(c.x).toBeCloseTo(layout.a.x, 3);
		expect(c.y).toBeCloseTo(layout.a.y + 12, 3);
		for (const id of ["a", "b", "d", "e", "f", "colA", "colC"])
			expect(layout[id].phases).toBeUndefined();
	});

	describe("a stack over two rows, and another Modulate that flips the rows", () => {
		const rows = (first: N, second: N): N[] => [
			{
				type: "StackV",
				id: "col",
				children: [
					{
						type: "StackH",
						id: "r1",
						children: [rect("a"), rect("b"), rect("c")],
					},
					{
						type: "StackH",
						id: "r2",
						children: [rect("d"), rect("e"), rect("f")],
					},
				],
			},
			first,
			second,
		];
		const across = (at: number): N =>
			modulate("m0", [rel("StackH", "o", ["a", "f"], { spacing: 12 })], { at });
		const flip = (at: number): N =>
			modulate("m1", [rel("StackV", "v", ["r2", "r1"], { spacing: 50 })], {
				at,
			});

		const gaps = (layout: LayoutResult, last: string) => {
			const at = (id: string) => boxAfter(layout, id, last);
			return {
				beside: at("f").x - (at("a").x + at("a").width),
				below: at("r1").y - (at("r2").y + at("r2").height),
				inRow: at("f").y - at("d").y,
			};
		};

		// f cannot sit beside a while its row is 50 above a's: the later one holds
		it("lets the stack go while a later flip holds, and f is back in its row", () => {
			const { scene, layout } = solve(rows(across(0.6), flip(1.4)));
			expect(scene.warnings).toEqual([]);
			expect(checkSolution(scene, layout)).toEqual([]);
			expect(gaps(layout, "m0").beside).toBeCloseTo(12, 2);
			expect(gaps(layout, "m1").below).toBeCloseTo(50, 2);
			expect(gaps(layout, "m1").inRow).toBeCloseTo(0, 2);
		});

		it("lets the flip go while a later stack holds", () => {
			const { scene, layout } = solve(rows(flip(0.6), across(1.4)));
			expect(scene.warnings).toEqual([]);
			expect(checkSolution(scene, layout)).toEqual([]);
			expect(gaps(layout, "m1").below).toBeCloseTo(50, 2);
			expect(gaps(layout, "m0").beside).toBeCloseTo(12, 2);
		});
	});

	it("moves a member from one list into another, which stays where it is", () => {
		const { scene, layout } = solve([
			columns(),
			modulate("move", [
				rel("StackV", "left", ["a"], {}),
				rel("StackV", "right", ["c", "b", "d"]),
			]),
		]);
		expect(scene.warnings).toEqual([]);
		expect(checkSolution(scene, layout)).toEqual([]);
		expect(layout.c.phases).toBeUndefined();
		const b = boxAfter(layout, "b", "move");
		expect(b.x).toBeCloseTo(layout.c.x, 3);
		expect(b.y).toBeCloseTo(layout.c.y + 20, 3);
		expect(boxAfter(layout, "d", "move").y).toBeCloseTo(layout.c.y + 40, 3);
	});

	it("carries a stack over several containers along with what holds them all", () => {
		const { scene, layout } = solve([
			{
				type: "StackV",
				id: "page",
				children: [rect("head", { height: 10 }), columns()],
			},
			// nothing here was placed against anything else, so it packs in place
			modulate("m", [rel("StackH", "o", ["colB", "colA", "colC"])]),
			modulate("tall", [rel("StackV", "p", ["head", "row"], { spacing: 30 })], {
				at: 1,
			}),
		]);
		expect(scene.warnings).toEqual([]);
		expect(checkSolution(scene, layout)).toEqual([]);
		expect(boxAfter(layout, "colB", "tall").x).toBeCloseTo(layout.colA.x, 3);
		expect(boxAfter(layout, "c", "tall").y).toBeCloseTo(layout.c.y + 20, 3);
	});

	it("solves home exactly as the scene without its Modulates does", () => {
		const scenes = (modulated: boolean): N[] => [
			{
				type: "StackH",
				id: "row",
				children: [
					{
						type: "StackV",
						id: "colA",
						children: [rect("a"), rect("b", { width: 33 })],
					},
					wrap("bg", [
						{
							type: "StackV",
							id: "colB",
							children: [rect("c"), rect("d", { height: 17 })],
						},
					]),
				],
			},
			...(modulated
				? [
						modulate("m", [
							rel("StackV", "o", ["b", "a"], { spacing: 2 }),
							rel("Align", "al", ["c", "d"], { alignment: "left" }),
							rel("StackH", "outer", ["o", "al"]),
						]),
					]
				: []),
		];
		const [withM, plain] = [solve(scenes(true)), solve(scenes(false))];
		expect(withM.scene.operatorNames).toEqual(plain.scene.operatorNames);
		for (const id of Object.keys(plain.layout))
			expect(home(withM.layout, id)).toEqual(home(plain.layout, id));
		// what the Modulate holds still rests on its members at home
		expect(home(withM.layout, "o")).toEqual(
			near({ ...home(plain.layout, "colA") }),
		);
	});

	it("folds each clock's events in start order and cuts a step short at the next", () => {
		const { scene, layout } = solve([
			list(["a", "b"]),
			modulate("late", [rel("StackV", "x", ["b", "a"])], { at: 1, over: 1 }),
			modulate("early", [rel("StackV", "y", ["b", "a"])], { at: 0.8 }),
			resolve("out", { at: 1.5 }),
		]);
		const [{ clock, events }] = foldPhases(scene.nodes, (id) => {
			const b = layout[id];
			return b.start === undefined
				? undefined
				: { start: b.start, duration: b.duration ?? 0 };
		});
		expect(clock).toBeUndefined();
		expect(events).toEqual([
			{ id: "early", start: 0.8, over: 0.2, active: ["early"] },
			{ id: "late", start: 1, over: 0.5, active: ["early", "late"] },
			{ id: "out", start: 1.5, over: 0.5, active: [] },
		]);
	});

	it("reads a node's box after every event", () => {
		const box = { x: 0, y: 0, width: 1, height: 1 };
		const moved = { ...box, x: 5 };
		expect(
			phaseBoxes({ ...box, phases: { b: moved, d: box } }, [
				{ id: "a" },
				{ id: "b" },
				{ id: "c" },
				{ id: "d" },
			]).map((b) => b.x),
		).toEqual([0, 5, 5, 0]);
		expect(lerpBoxes(box, moved, 0.5).x).toBe(2.5);
	});
});

const sceneArb = fc.integer({ min: 3, max: 6 }).chain((n) =>
	fc.record({
		n: fc.constant(n),
		sizes: fc.array(fc.integer({ min: 4, max: 40 }), {
			minLength: n,
			maxLength: n,
		}),
		homeType: fc.constantFrom("StackV", "StackH"),
		modulations: fc.array(
			fc.record({
				type: fc.constantFrom(
					"StackV",
					"StackH",
					"Align",
					"Distribute",
					"Background",
					"Span",
				),
				members: fc.uniqueArray(fc.integer({ min: 0, max: n - 1 }), {
					minLength: 2,
					maxLength: n,
				}),
				at: fc.integer({ min: 0, max: 6 }),
			}),
			{ minLength: 1, maxLength: 4 },
		),
		resolves: fc.array(fc.integer({ min: 0, max: 8 }), { maxLength: 2 }),
	}),
);
type S = typeof sceneArb extends fc.Arbitrary<infer T> ? T : never;
// Two lists side by side and a box round the first mark, so modulations
// reach across containers and restate a Background
const json = (s: S, modulated = true): N => {
	const marks = s.sizes.map((size, i) =>
		rect(`r${i}`, { width: size, height: 44 - size }),
	);
	const half = Math.ceil(s.n / 2);
	const other = s.homeType === "StackV" ? "StackH" : "StackV";
	return {
		type: "Group",
		id: "root",
		children: [
			{
				type: s.homeType,
				id: "home",
				children: [
					{ type: other, id: "near", children: marks.slice(0, half) },
					{ type: other, id: "far", children: marks.slice(half) },
				],
			},
			{ type: "Background", id: "mark", children: [ref("r0")] },
			...(modulated
				? [
						...s.modulations.map((m, j) =>
							modulate(
								`m${j}`,
								[
									rel(
										m.type,
										`rel${j}`,
										[
											...(m.type === "Background" ? ["mark"] : []),
											...m.members.map((i) => `r${i}`),
										],
										{ spacing: 5 },
									),
								],
								{ at: m.at / 2 },
							),
						),
						...s.resolves.map((at, j) => resolve(`back${j}`, { at: at / 2 })),
					]
				: []),
		],
	};
};

describe("phases (properties)", () => {
	it("is home with nothing active, and depends only on what is active", () => {
		fc.assert(
			fc.property(sceneArb, (s) => {
				const scene = buildSceneFromJson(json(s));
				const layout = solveLayout(scene);
				const plainScene = buildSceneFromJson(json(s, false));
				const plain = solveLayout(plainScene);
				// home is solved by the very relations of the scene without them
				expect(scene.operatorNames).toEqual(plainScene.operatorNames);
				for (const id of Object.keys(plain))
					for (const side of ["x", "y", "width", "height"] as const)
						expect(layout[id][side]).toBe(plain[id][side]);
				const span = (id: string) => ({
					start: layout[id].start ?? 0,
					duration: layout[id].duration ?? 0,
				});
				const [{ events }] = foldPhases(scene.nodes, span);
				const seen = new Map<string, string>();
				const ids = [...s.sizes.map((_, i) => `r${i}`), "mark", "near", "far"];
				const boxes = ids.map((id) =>
					phaseBoxes(layout[id], events).map(({ x, y, width, height }) => ({
						x,
						y,
						width,
						height,
					})),
				);
				events.forEach((e, k) => {
					const state = JSON.stringify(boxes.map((b) => b[k]));
					if (e.active.length === 0)
						expect(state).toBe(
							JSON.stringify(ids.map((id) => home(layout, id))),
						);
					const key = e.active.join();
					// the same modulations give the same layout, however they came about
					const known = seen.get(key);
					if (known !== undefined)
						expect(JSON.parse(state)).toEqual(
							JSON.parse(known).map((b: Record<string, number>) =>
								Object.fromEntries(
									Object.entries(b).map(([c, v]) => [c, expect.closeTo(v, 2)]),
								),
							),
						);
					else seen.set(key, state);
				});
			}),
			{ numRuns: 200 },
		);
	});

	it("settles any one relation over marks of two lists, whatever placed them", () => {
		const stacks = fc.constantFrom("StackV", "StackH");
		fc.assert(
			fc.property(
				fc.record({
					kinds: fc.tuple(stacks, stacks, stacks),
					widths: fc.array(fc.integer({ min: 10, max: 40 }), {
						minLength: 6,
						maxLength: 6,
					}),
					type: fc.constantFrom(
						"StackV",
						"StackH",
						"Align",
						"Distribute",
						"Background",
						"Span",
					),
					members: fc.uniqueArray(fc.integer({ min: 0, max: 5 }), {
						minLength: 2,
						maxLength: 4,
					}),
					alignment: fc.constantFrom("left", "centerY", "center"),
					axis: fc.constantFrom("x", "y"),
				}),
				({ kinds, widths, type, members, alignment, axis }) => {
					const marks = widths.map((width, i) => rect(`r${i}`, { width }));
					const { scene, layout } = solve([
						{
							type: kinds[0],
							id: "row",
							children: [
								{ type: kinds[1], id: "near", children: marks.slice(0, 3) },
								{ type: kinds[2], id: "far", children: marks.slice(3) },
							],
						},
						{ type: "Background", id: "frame", children: [ref("r0")] },
						modulate("m", [
							rel(
								type,
								"held",
								[
									...(type === "Background" ? ["frame"] : []),
									...members.map((i) => `r${i}`),
								],
								{ spacing: 5, alignment, axis },
							),
						]),
					]);
					expect(scene.warnings).toEqual([]);
					expect(checkSolution(scene, layout)).toEqual([]);
				},
			),
			{ numRuns: 300 },
		);
	});

	it("declared writes solve the phases exactly as the full scan does", () => {
		const withoutWrites = (ops: LayoutOperator[]): LayoutOperator[] =>
			ops.map((op) => (cur, next) => op(cur, next));
		fc.assert(
			fc.property(sceneArb, (s) => {
				const scene = buildSceneFromJson(json(s));
				const slow = {
					...scene,
					operators: withoutWrites(scene.operators),
					phaseOperators: (active: readonly string[]) => {
						const phase = scene.phaseOperators?.(active);
						return {
							operators: withoutWrites(phase?.operators ?? []),
							names: phase?.names ?? [],
						};
					},
				};
				expect(solveLayout(scene)).toEqual(solveLayout(slow));
			}),
			{ numRuns: 200 },
		);
	});
});
