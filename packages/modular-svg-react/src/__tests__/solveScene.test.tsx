import { solveLayout } from "@modular-svg/core";
import { describe, expect, it } from "vitest";
import { renderScene } from "../reconciler";
import { solveScene } from "../solveScene";

const row = (
	<stackH spacing={10}>
		<rect key="a" width={20} height={20} stroke="none" stroke-width={0} />
		<rect
			key="b"
			width={30}
			height={40}
			stroke="none"
			stroke-width={0}
			rx={4}
		/>
	</stackH>
);

describe("solveScene", () => {
	it("keeps the scene's own coordinates without a pin", () => {
		const layout = solveLayout(renderScene(row));
		const { box } = solveScene(row);
		expect(box("a")).toEqual(layout.a);
		expect(box("b")).toEqual(layout.b);
	});

	it("pins a node's top-left where asked", () => {
		const { box, toScene } = solveScene(row, {
			pin: { node: "b", x: 100, y: 50 },
		});
		expect(box("b")).toMatchObject({ x: 100, y: 50 });
		expect(box("a").x).toBeCloseTo(70);
		expect(toScene({ x: 100, y: 50 })).toEqual({
			x: solveLayout(renderScene(row)).b.x,
			y: solveLayout(renderScene(row)).b.y,
		});
	});

	it("throws for a node the scene does not have", () => {
		expect(() => solveScene(row).box("nope")).toThrow("No node nope");
		expect(() =>
			solveScene(row, { pin: { node: "nope", x: 0, y: 0 } }),
		).toThrow("No node nope");
	});

	it("draws marks where their boxes are", () => {
		const { box, marks } = solveScene(row, {
			pin: { x: 5, y: 7 },
			position: "transform",
		});
		const [b] = marks((id) => id === "b");
		expect(b.props.transform).toBe(`translate(${box("b").x}, ${box("b").y})`);
		expect(marks()).toHaveLength(2);
	});

	it("draws marks relative to an origin, for a group placed there", () => {
		const { box, marks } = solveScene(row, { position: "transform" });
		const [b] = marks((id) => id === "b", { origin: box("b"), ids: false });
		expect(b.props).toMatchObject({
			transform: "translate(0, 0)",
			width: 30,
			rx: 4,
		});
		expect(b.props.id).toBeUndefined();
	});

	it("positions by attributes unless asked otherwise", () => {
		const { box, marks } = solveScene(row);
		expect(marks((id) => id === "a")[0].props).toMatchObject({
			x: box("a").x,
			y: box("a").y,
		});
	});
});
