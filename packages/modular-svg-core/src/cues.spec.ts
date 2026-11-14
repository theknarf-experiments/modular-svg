import { describe, expect, it } from "vitest";
import { cueSchedule, cuesBetween } from "./cues.ts";
import { buildSceneFromJson } from "./parser.ts";
import { solveLayout } from "./solver/index.ts";

type N = Record<string, unknown>;
const ref = (target: string): N => ({ type: "Ref", target });
const enter = (id: string, props: N): N => ({
	type: "Enter",
	id,
	props,
	children: [ref("a")],
});
const scheduleOf = (children: N[], duration: number, loop = false) => {
	const scene = buildSceneFromJson({
		type: "Group",
		id: "root",
		children: [{ type: "Circle", id: "a", props: { r: 5 } }, ...children],
	});
	return { ...cueSchedule(solveLayout(scene), scene.nodes), duration, loop };
};
const fired = (
	solution: ReturnType<typeof scheduleOf>,
	keys: string[],
	from: number,
	to: number,
) =>
	cuesBetween(solution, keys, from, to).map(
		(c) => `${c.id}:${c.edge}@${Math.round(c.at * 1e6) / 1e6}`,
	);

describe("cues inside a phrase", () => {
	const hit = enter("hit", { at: 0.25, over: 0.5 });

	it("fire on every pass", () => {
		const solution = scheduleOf(
			[
				{
					type: "Phrase",
					id: "p",
					props: { at: 1, repeat: 3 },
					children: [hit],
				},
			],
			4,
		);
		expect(fired(solution, ["hit", "hit:end"], -1, 10)).toEqual([
			"hit:start@1.25",
			"hit:end@1.75",
			"hit:start@2",
			"hit:end@2.5",
			"hit:start@2.75",
			"hit:end@3.25",
		]);
		// the phrase itself is one span
		expect(fired(solution, ["p", "p:end"], -1, 10)).toEqual([
			"p:start@1",
			"p:end@3.25",
		]);
	});

	it("start when the node starts to play, also on a pass that runs backwards", () => {
		const solution = scheduleOf(
			[
				{
					type: "Phrase",
					id: "p",
					props: { repeat: 2, alternate: true, rate: 0.5 },
					children: [hit, enter("tail", { at: 0.75, over: 0.25 })],
				},
			],
			4,
		);
		// one pass is 2s; the second mirrors the first around 2s
		expect(fired(solution, ["hit", "hit:end"], -1, 10)).toEqual([
			"hit:start@0.5",
			"hit:end@1.5",
			"hit:start@2.5",
			"hit:end@3.5",
		]);
		expect(fired(solution, ["tail", "tail:end"], -1, 10)).toEqual([
			"tail:start@1.5",
			"tail:start@2",
			"tail:end@2",
			"tail:end@2.5",
		]);
	});

	it("fire through nested phrases, and until the time around a repeating one ends", () => {
		const solution = scheduleOf(
			[
				{
					type: "Phrase",
					id: "outer",
					props: { retrograde: true },
					children: [
						{
							type: "Phrase",
							id: "inner",
							props: { repeat: true },
							children: [enter("hit", { at: 0.25, over: 0.5 })],
						},
						enter("long", { over: 2 }),
					],
				},
			],
			2,
		);
		// inner passes of 0.75s fill outer's 2s; the third is cut where outer
		// ends, and outer plays it all backwards
		expect(fired(solution, ["hit", "hit:end"], -1, 10)).toEqual([
			"hit:start@0",
			"hit:end@0.25",
			"hit:start@0.5",
			"hit:end@1",
			"hit:start@1.25",
			"hit:end@1.75",
		]);
	});

	it("repeat with a looping scene", () => {
		const solution = scheduleOf(
			[{ type: "Phrase", id: "p", props: { repeat: 2 }, children: [hit] }],
			2,
			true,
		);
		expect(fired(solution, ["hit"], 1.5, 4.5)).toEqual([
			"hit:start@2.25",
			"hit:start@3",
			"hit:start@4.25",
		]);
		// far along, a frame still finds only what is in it
		expect(fired(solution, ["hit"], 2e9 + 0.2, 2e9 + 0.3)).toEqual([
			"hit:start@2000000000.25",
		]);
	});
});
