import { solveScene } from "@modular-svg/react";
import { describe, expect, it } from "vitest";
import { Scene as Direction } from "./DragDirection";
import { Scene as Flowchart } from "./DragFlowchart";
import { Scene as Kanban, placements } from "./DragKanban";
import { nearest, Scene as Planets } from "./DragPlanets";
import { moved, Scene as Sentence } from "./DragReorder";

describe("DragDirection", () => {
	it("puts the last box after the others either way", () => {
		const row = solveScene(<Direction direction="stackH" />).box;
		const column = solveScene(<Direction direction="stackV" />).box;
		expect(row("c").x).toBeGreaterThan(row("b").x + row("b").width);
		expect(column("c").y).toBeGreaterThan(column("b").y + column("b").height);
	});
});

describe("DragReorder", () => {
	it("moves an item to every index", () => {
		expect(moved(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
		expect(moved(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
		expect(moved(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
	});

	it("lays chips out by their text, so a reorder shifts the rest", () => {
		const before = solveScene(<Sentence words={["a", "longer"]} />).box;
		const after = solveScene(<Sentence words={["longer", "a"]} />).box;
		expect(before("chip-longer").width).toBeGreaterThan(before("chip-a").width);
		expect(after("chip-a").x).toBeCloseTo(
			after("chip-longer").x + after("chip-longer").width + 8,
		);
	});
});

describe("DragKanban", () => {
	const board = { todo: ["docs", "bug"], doing: ["review"], done: [] };

	it("offers every slot in every column", () => {
		const options = placements(board, "docs");
		// todo: 2 slots without docs, doing: 2, done: 1
		expect(options).toHaveLength(5);
		expect(options).toContainEqual({
			todo: ["bug"],
			doing: ["review"],
			done: ["docs"],
		});
		for (const o of options)
			expect([...o.todo, ...o.doing, ...o.done].sort()).toEqual([
				"bug",
				"docs",
				"review",
			]);
	});

	it("grows a column with its cards", () => {
		const empty = solveScene(<Kanban {...board} />).box("column-done");
		const full = solveScene(
			<Kanban todo={["bug"]} doing={["review"]} done={["docs"]} />,
		).box("column-done");
		expect(full.height).toBeGreaterThan(empty.height);
	});
});

describe("DragFlowchart", () => {
	const nodes = {
		idea: { label: "idea", x: 30, y: 100 },
		draft: { label: "draft", x: 150, y: 40 },
		review: { label: "review", x: 280, y: 100 },
		ship: { label: "ship", x: 380, y: 190 },
	};
	const edge = (state: typeof nodes) =>
		solveScene(<Flowchart nodes={state} />).marks(
			(id) => id === "edge-idea-draft",
		)[0].props;

	it("keeps the canvas still while a node moves", () => {
		const a = solveScene(<Flowchart nodes={nodes} />).box("node-draft");
		const b = solveScene(
			<Flowchart nodes={{ ...nodes, idea: { label: "idea", x: 20, y: 20 } }} />,
		).box("node-draft");
		expect(b).toEqual(a);
	});

	it("re-solves an arrow when its node moves", () => {
		const moved = { ...nodes, idea: { label: "idea", x: 30, y: 180 } };
		expect(edge(moved)).toHaveProperty("x1");
		expect(edge(moved)).not.toEqual(edge(nodes));
	});
});

describe("DragPlanets", () => {
	const order = ["mercury", "venus", "earth", "mars"] as const;
	const at = (target: (typeof order)[number], o = [...order]) =>
		solveScene(<Planets order={o} target={target} />).box;

	it("hangs the label over whichever planet it names", () => {
		for (const target of order) {
			const box = at(target);
			const [label, planet] = [box("label"), box(target)];
			expect(label.x + label.width / 2).toBeCloseTo(
				planet.x + planet.width / 2,
			);
			expect(planet.y - (label.y + label.height)).toBeCloseTo(60);
		}
	});

	it("keeps the label on its planet when the row is reordered", () => {
		const box = at("earth", ["earth", "mercury", "venus", "mars"]);
		expect(box("earth").x).toBeLessThan(box("mercury").x);
		expect(box("label").x + box("label").width / 2).toBeCloseTo(
			box("earth").x + box("earth").width / 2,
		);
	});

	it("draws the arrow from a held label to its planet", () => {
		const held = { x: 200, y: -150 };
		const { box, marks } = solveScene(
			<Planets order={[...order]} target="mars" held={held} />,
		);
		expect(box("label")).toMatchObject(held);
		const [line] = marks((id) => id === "arrow");
		const { x1, y1, x2 } = line.props;
		expect(Number(y1)).toBeGreaterThan(held.y);
		expect(Number(x2)).toBeGreaterThan(Number(x1));
	});

	it("names the planet nearest a held label", () => {
		const o = [...order];
		const earth = at("earth")("earth");
		const held = { x: earth.x + earth.width / 2 - 20, y: -150 };
		expect(nearest({ order: o, target: "mercury", held })).toBe("earth");
	});

	it("keeps the planets still while the label moves", () => {
		const rows = order.map((target) => at(target)("bg"));
		for (const row of rows) expect(row).toEqual(rows[0]);
	});
});
