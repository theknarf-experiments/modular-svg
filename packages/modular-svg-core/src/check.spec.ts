import { describe, expect, it } from "vitest";
import { buildSceneFromJson, checkLayout, checkSolution } from "./parser.ts";
import { solveLayout } from "./solver/index.ts";

const rect = (id: string, props: Record<string, unknown> = {}) => ({
	type: "Rect",
	id,
	props: { width: 20, height: 20, ...props },
});
const ref = (target: string) => ({ type: "Ref", target });

describe("post-solve checks", () => {
	it("passes a satisfiable layout", () => {
		const scene = buildSceneFromJson({
			type: "StackH",
			id: "row",
			children: [rect("a"), rect("b")],
		});
		expect(checkSolution(scene, solveLayout(scene))).toEqual([]);
	});

	it("names layout relations the solution does not satisfy", () => {
		// both rects are pinned, so the stack cannot place them 10 apart
		const scene = buildSceneFromJson({
			type: "Group",
			children: [
				rect("a", { x: 0, y: 0 }),
				rect("b", { x: 200, y: 0 }),
				{
					type: "Distribute",
					id: "d",
					props: { spacing: 10 },
					children: [ref("a"), ref("b")],
				},
				{
					type: "Distribute",
					id: "e",
					props: { spacing: 50 },
					children: [ref("a"), ref("b")],
				},
			],
		});
		expect(checkLayout(scene, solveLayout(scene))[0]).toMatch(
			/distribute\(a, b\).*did not settle|distribute\(a, b\) does not hold/,
		);
	});

	const row = (ids: string[]) => ({
		type: "StackH",
		id: "row",
		props: { spacing: 30 },
		children: ids.map((id) => rect(id)),
	});
	const modulate = (
		id: string,
		children: unknown[],
		props: Record<string, unknown> = {},
	) => ({ type: "Modulate", id, props, children });
	const align = (ids: string[]) => ({
		type: "Align",
		props: { alignment: "center" },
		children: ids.map(ref),
	});
	const check = (children: unknown[]) => {
		const scene = buildSceneFromJson({ type: "Group", id: "root", children });
		return [...scene.warnings, ...checkSolution(scene, solveLayout(scene))];
	};

	it("passes a modulation that settles", () => {
		expect(
			check([
				row(["a", "b"]),
				rect("job"),
				modulate("m", [align(["b", "job"])]),
			]),
		).toEqual([]);
	});

	it("warns when two relations of one Modulate place the same thing", () => {
		expect(
			check([
				row(["a", "b"]),
				rect("job"),
				modulate("m", [align(["a", "job"]), align(["b", "job"])]),
			]),
		).toEqual([
			"Modulate(m): align(centerY) conflicts with another relation over job:y",
			"Modulate(m): align(centerX) conflicts with another relation over job:x",
			expect.stringMatching(/^after Modulate\(m\): align\(.*did not settle$/),
		]);
	});

	it("names the Modulate whose phase does not hold", () => {
		// both ends are pinned by the author, so the modulated stack cannot pack them
		const warnings = check([
			rect("a", { x: 0, y: 0 }),
			rect("b", { x: 200, y: 0 }),
			modulate("m", [
				{
					type: "Distribute",
					id: "d",
					props: { spacing: 10 },
					children: [ref("a"), ref("b")],
				},
				{
					type: "Distribute",
					id: "e",
					props: { spacing: 50 },
					children: [ref("a"), ref("b")],
				},
			]),
		]);
		expect(warnings.at(-1)).toMatch(/^after Modulate\(m\): distribute\(a, b\)/);
	});

	it("warns about what a Modulate cannot hold", () => {
		expect(
			check([
				row(["a", "b"]),
				modulate("m", [
					ref("a"),
					{ type: "Background", id: "bg", children: [ref("a")] },
					{ type: "Background", id: "bg2", children: [ref("row"), ref("a")] },
					{ type: "Group", id: "g", children: [ref("a")] },
					{ type: "StackH", id: "s", children: [ref("b"), rect("new")] },
				]),
			]),
		).toEqual([
			"Modulate(m) refs a outside a relation, which changes nothing",
			"Modulate(m): Background(bg) restates a around nothing; ref what it wraps after the box",
			"Modulate(m): Background(bg2) needs a ref to the Background or Rect it restates first, then refs to what that wraps",
			"Modulate(m): Group cannot be modulated, so it is read as if declared outside; only StackV, StackH, Align, Distribute, Background and Span can",
			"Modulate(m) declares a Rect inside it; declare marks outside and ref them",
		]);
	});

	it("still resolves a ref to something a Modulate could not hold", () => {
		const warnings = check([
			row(["a", "b"]),
			rect("c"),
			modulate("m", [
				{ type: "Group", id: "g", children: [ref("a"), ref("b")] },
			]),
			{
				type: "Align",
				props: { alignment: "left" },
				children: [ref("g"), ref("c")],
			},
		]);
		expect(warnings).toEqual([
			"Modulate(m): Group cannot be modulated, so it is read as if declared outside; only StackV, StackH, Align, Distribute, Background and Span can",
		]);
	});

	it("warns when a Resolve releases something that is not a Modulate", () => {
		expect(
			check([
				row(["a", "b"]),
				{ type: "Resolve", id: "r", children: [ref("a")] },
			]),
		).toEqual(["Resolve(r) releases a, which is not a Modulate"]);
	});

	it("warns when a change of layout starts before the last one settled", () => {
		expect(
			check([
				row(["a", "b"]),
				modulate("m", [{ type: "StackH", children: [ref("b"), ref("a")] }], {
					over: 1,
				}),
				{ type: "Resolve", id: "r", props: { at: 0.4 } },
			]),
		).toEqual([
			"Resolve(r) starts while Modulate(m) is still settling; m is cut short",
		]);
	});

	it("warns when a Travel aims at something a Modulate moves", () => {
		expect(
			check([
				row(["a", "b"]),
				rect("dot", { width: 4, height: 4 }),
				{ type: "Travel", id: "trip", children: [ref("dot"), ref("b")] },
				modulate("m", [{ type: "StackH", children: [ref("b"), ref("a")] }]),
			]),
		).toEqual([
			"Travel(trip) aims at b's home position, which Modulate(m) moves",
		]);
	});

	it("warns when a Modulate moves the end of a connector a Travel rides", () => {
		expect(
			check([
				row(["a", "b"]),
				rect("dot", { width: 4, height: 4 }),
				{ type: "Curve", id: "wire", children: [ref("a"), ref("b")] },
				{
					type: "Travel",
					id: "trip",
					props: { route: "along" },
					children: [ref("dot"), ref("wire")],
				},
				modulate("m", [{ type: "StackH", children: [ref("b"), ref("a")] }]),
			]),
		).toEqual([
			"Travel(trip) aims at wire's home position, which Modulate(m) moves",
		]);
	});

	it("says what a Travel's route cannot do", () => {
		const travel = (props: Record<string, unknown>, via: string) => ({
			type: "Travel",
			id: "trip",
			props,
			children: [ref("dot"), ref(via)],
		});
		const scene = (props: Record<string, unknown>, via: string) =>
			check([
				row(["a", "b"]),
				rect("dot", { width: 4, height: 4 }),
				{
					type: "Path",
					id: "two",
					props: { d: "M 0 0 L 10 0 A 5 5 0 0 1 20 0 M 30 0 L 40 0" },
				},
				travel(props, via),
			]);
		expect(scene({ route: "along" }, "a")).toEqual([
			"Travel(trip) cannot follow a: a rect has no path, so it is passed through its centre",
		]);
		expect(scene({ route: "along", pace: "leg" }, "two")).toEqual([
			'Travel(trip): a route along marks has no legs, so pace="leg" is read as "trip"',
			"Travel(trip) follows only the first subpath of two",
			"Travel(trip): two draws an arc (A), which is followed as a straight line; use C or an Arc",
		]);
		expect(scene({ orient: "yes" }, "a")).toEqual([
			'Travel(trip): orient must be true or an angle in degrees, got "yes"',
		]);
		expect(scene({ route: "curvy", pace: "fast" }, "a")).toEqual([
			'Travel(trip): route must be "straight", "smooth" or "along", got "curvy"',
			'Travel(trip): pace must be "leg" or "trip", got "fast"',
		]);
		expect(scene({ route: "smooth", orient: -90, pace: "leg" }, "a")).toEqual(
			[],
		);
	});

	it("names an ease whose numbers are out of range, on motions, steps and modulations", () => {
		expect(
			check([
				row(["a", "b"]),
				{
					type: "Enter",
					id: "in",
					props: { ease: { kind: "spring", bounce: 3 } },
					children: [ref("a")],
				},
				{
					type: "Motion",
					id: "mo",
					props: {
						steps: [
							{ to: { x: 4 }, over: 1, ease: { kind: "elastic", period: 0 } },
						],
					},
					children: [ref("b")],
				},
				modulate("m", [{ type: "StackH", children: [ref("b"), ref("a")] }], {
					ease: { kind: "bounce", bounces: 0 },
				}),
			]),
		).toEqual([
			"Enter(in): spring bounce must be between -0.9 and 0.9, got 3; using the nearest allowed value",
			"Motion(mo): elastic period must be between 0.1 and 1, got 0; using the nearest allowed value",
			"Modulate(m): bounce bounces must be 1 to 6, got 0; using the nearest allowed value",
		]);
	});

	it("warns when modulations in different time move the same mark", () => {
		const swap = (id: string) =>
			modulate(id, [{ type: "StackH", children: [ref("b"), ref("a")] }]);
		const warnings = check([
			row(["a", "b"]),
			swap("m"),
			{ type: "Phrase", id: "p", children: [swap("n")] },
		]);
		expect(warnings).toEqual([
			"Modulate(m) and Modulate(n) play in different time and both move a; their moves add up",
		]);
	});
});
