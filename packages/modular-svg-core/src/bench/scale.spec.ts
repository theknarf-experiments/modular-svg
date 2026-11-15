import { expect, it } from "vitest";
import { buildSceneFromJson, checkSolution } from "../parser.ts";
import { solveLayout } from "../solver/index.ts";
import { layoutToAst } from "../svg_ast.ts";
import { reorderScene, scaleScene } from "./scene.ts";

// A budget, not a benchmark: 2000 marks take about 0.2s. The solver used to
// copy the whole state for every relation, which made this take over a
// minute; a quadratic regression fails here long before CI noise does.
it("parses, solves, checks and compiles 2000 marks within budget", () => {
	const t0 = performance.now();
	const scene = buildSceneFromJson(scaleScene(2000));
	const layout = solveLayout(scene);
	expect(checkSolution(scene, layout)).toEqual([]);
	layoutToAst(layout, scene.nodes, 0, { animation: { loop: true } });
	expect(performance.now() - t0).toBeLessThan(3000);
});

it("stays within budget when four modulations move the marks about", () => {
	const t0 = performance.now();
	const scene = buildSceneFromJson(scaleScene(2000, { modulations: true }));
	const layout = solveLayout(scene);
	expect(checkSolution(scene, layout)).toEqual([]);
	expect(Object.keys(layout.m0.phases ?? {})).toEqual([
		"flip",
		"reverse0",
		"rotate0",
		"settle",
	]);
	layoutToAst(layout, scene.nodes, 0, { animation: { loop: true } });
	expect(performance.now() - t0).toBeLessThan(3000);
});

it("stays within budget when every row plays in a phrase of its own", () => {
	const t0 = performance.now();
	const scene = buildSceneFromJson(scaleScene(2000, { phrases: true }));
	const layout = solveLayout(scene);
	expect(checkSolution(scene, layout)).toEqual([]);
	layoutToAst(layout, scene.nodes, 0, { animation: { loop: true } });
	expect(performance.now() - t0).toBeLessThan(3000);
});

it("stays within budget and linear with springs and smooth travel on every row", () => {
	const run = (n: number): number => {
		const t0 = performance.now();
		const scene = buildSceneFromJson(scaleScene(n, { springs: true }));
		const layout = solveLayout(scene);
		expect(checkSolution(scene, layout)).toEqual([]);
		const ast = layoutToAst(layout, scene.nodes, 0, {
			animation: { loop: true },
		});
		expect(ast.css).toContain("linear(");
		expect(ast.css).toContain("rotate:");
		return performance.now() - t0;
	};
	const best = (n: number) => Math.min(run(n), run(n));
	run(200);
	const [few, many] = [best(400), best(1600)];
	expect(many / few).toBeLessThan(7);
	expect(many).toBeLessThan(3000);
}, 20000);

it("stays within budget and linear with a camera on every row, following it through the modulations", () => {
	const run = (n: number): number => {
		const t0 = performance.now();
		const scene = buildSceneFromJson(
			scaleScene(n, { cameras: true, modulations: true }),
		);
		const layout = solveLayout(scene);
		expect(checkSolution(scene, layout)).toEqual([]);
		const ast = layoutToAst(layout, scene.nodes, 0, {
			animation: { loop: true },
		});
		expect(ast.viewBox).toBeDefined();
		return performance.now() - t0;
	};
	const best = (n: number) => Math.min(run(n), run(n));
	run(200);
	const [few, many] = [best(500), best(2000)];
	expect(many / few).toBeLessThan(7);
	expect(many).toBeLessThan(3000);
}, 20000);

it("stays within budget and linear with every row in a clip that a motion opens", () => {
	const run = (n: number): number => {
		const t0 = performance.now();
		const scene = buildSceneFromJson(scaleScene(n, { clips: true }));
		expect(scene.warnings).toEqual([]);
		const layout = solveLayout(scene);
		expect(checkSolution(scene, layout)).toEqual([]);
		const ast = layoutToAst(layout, scene.nodes, 0, {
			animation: { loop: true },
		});
		expect(ast.defs).toHaveLength(Math.ceil(n / 10));
		expect(ast.css).toContain("clip-path:inset(");
		return performance.now() - t0;
	};
	const best = (n: number) => Math.min(run(n), run(n));
	run(200);
	const [few, many] = [best(500), best(2000)];
	expect(many / few).toBeLessThan(7);
	expect(many).toBeLessThan(3000);
}, 20000);

// One solve per change of layout is the design; what a change costs must not
// grow with how many others there are. Every phase used to relax all the
// modulations it did not use, so four times the changes took eleven times as
// long; linear is four.
it("stays linear in the number of modulations", () => {
	const run = (changes: number): number => {
		const t0 = performance.now();
		const scene = buildSceneFromJson(reorderScene(40, changes));
		const layout = solveLayout(scene);
		expect(checkSolution(scene, layout)).toEqual([]);
		expect(Object.keys(layout.m0.phases ?? {})).toHaveLength(changes * 2);
		layoutToAst(layout, scene.nodes, 0, {});
		return performance.now() - t0;
	};
	const best = (changes: number) => Math.min(run(changes), run(changes));
	run(50);
	const few = best(200);
	const many = best(800);
	expect(many / few).toBeLessThan(7);
	expect(many).toBeLessThan(3000);
});

// A phase is solved, compared with home and checked on the slots its
// relations write. Each of those used to copy the whole state, whose size
// grows with the changes themselves: four times as many took nearly eight
// times as long to solve and check.
it("solves and checks a change of layout without passing over the scene", () => {
	const run = (changes: number): number => {
		const scene = buildSceneFromJson(reorderScene(10, changes));
		const t0 = performance.now();
		const layout = solveLayout(scene);
		expect(checkSolution(scene, layout)).toEqual([]);
		return performance.now() - t0;
	};
	const best = (changes: number) =>
		Math.min(run(changes), run(changes), run(changes));
	run(50);
	expect(best(2400) / best(600)).toBeLessThan(6);
});
