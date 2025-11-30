import { describe, expect, it } from "vitest";
import { buildSceneFromJson } from "./parser";
import { solveLayout } from "./solver";
import { layoutToAst } from "./svg_ast";

describe("SVG AST", () => {
	it("generates structured AST from layout", () => {
		const json = {
			type: "Group",
			children: [
				{
					type: "Circle",
					id: "test-circle",
					props: { r: 10, fill: "red" },
				},
			],
		};

		const scene = buildSceneFromJson(json);
		const layout = solveLayout(scene);
		const ast = layoutToAst(layout, scene.nodes, 5);

		expect(ast.width).toBeGreaterThan(0);
		expect(ast.height).toBeGreaterThan(0);
		expect(ast.children).toHaveLength(1);
		expect(ast.children[0].type).toBe("circle");
		if (ast.children[0].type === "circle") {
			expect(ast.children[0].id).toBe("test-circle");
			expect(ast.children[0].r).toBe(10);
			expect(ast.children[0].fill).toBe("red");
		}
	});

	it("generates AST with multiple elements", () => {
		const json = {
			type: "StackH",
			id: "stack",
			props: { spacing: 10 },
			children: [
				{ type: "Circle", id: "c1", props: { r: 5 } },
				{ type: "Circle", id: "c2", props: { r: 8 } },
				{ type: "Rect", id: "r1", props: { width: 10, height: 15 } },
			],
		};

		const scene = buildSceneFromJson(json);
		const layout = solveLayout(scene);
		const ast = layoutToAst(layout, scene.nodes);

		// Should have stack container + 3 children
		expect(ast.children.length).toBeGreaterThanOrEqual(3);

		const circles = ast.children.filter((el) => el.type === "circle");
		const rects = ast.children.filter((el) => el.type === "rect");

		expect(circles.length).toBeGreaterThanOrEqual(2);
		expect(rects.length).toBeGreaterThanOrEqual(1);
	});

	it("generates arrow as line + polygon elements", () => {
		const json = {
			type: "Group",
			children: [
				{ type: "Circle", id: "a", props: { r: 5, x: 0, y: 0 } },
				{ type: "Circle", id: "b", props: { r: 5, x: 0, y: 50 } },
				{
					type: "Arrow",
					id: "arrow",
					children: [
						{ type: "Ref", target: "a" },
						{ type: "Ref", target: "b" },
					],
				},
			],
		};

		const scene = buildSceneFromJson(json);
		const layout = solveLayout(scene);
		const ast = layoutToAst(layout, scene.nodes, 10);

		const lines = ast.children.filter((el) => el.type === "line");
		const polygons = ast.children.filter((el) => el.type === "polygon");

		expect(lines.length).toBe(1);
		expect(polygons.length).toBe(1);
	});

	it("preserves element attributes", () => {
		const json = {
			type: "Group",
			children: [
				{
					type: "Rect",
					id: "styled-rect",
					props: {
						width: 20,
						height: 30,
						fill: "blue",
						stroke: "green",
						"stroke-width": 2,
					},
				},
			],
		};

		const scene = buildSceneFromJson(json);
		const layout = solveLayout(scene);
		const ast = layoutToAst(layout, scene.nodes);

		const rect = ast.children.find((el) => el.id === "styled-rect");
		expect(rect).toBeDefined();
		if (rect && rect.type === "rect") {
			expect(rect.fill).toBe("blue");
			expect(rect.stroke).toBe("green");
			expect(rect.strokeWidth).toBe(2);
		}
	});
});
