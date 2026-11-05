import { bench, describe } from "vitest";
import { buildSceneFromJson, checkSolution } from "../parser.ts";
import { solveLayout } from "../solver/index.ts";
import { layoutToAst } from "../svg_ast.ts";
import { scaleScene } from "./scene.ts";

// pnpm bench: every stage at a few sizes; it should grow linearly with n
for (const n of [200, 1000]) {
	describe(`${n} marks`, () => {
		const json = scaleScene(n);
		const scene = buildSceneFromJson(json);
		const layout = solveLayout(scene);
		bench("parse", () => void buildSceneFromJson(json));
		bench("solve", () => void solveLayout(scene));
		bench("check", () => void checkSolution(scene, layout));
		bench(
			"compile",
			() =>
				void layoutToAst(layout, scene.nodes, 0, { animation: { loop: true } }),
		);
	});
}
