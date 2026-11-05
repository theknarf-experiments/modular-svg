import { expect, it } from "vitest";
import { buildSceneFromJson, checkSolution } from "../parser.ts";
import { solveLayout } from "../solver/index.ts";
import { layoutToAst } from "../svg_ast.ts";
import { scaleScene } from "./scene.ts";

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
