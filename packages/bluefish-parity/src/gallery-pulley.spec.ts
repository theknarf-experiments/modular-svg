import { describe, it } from "vitest";
import pulleyJson from "../../../examples/pulley.json";
import {
	type BluefishModule,
	expectShapesToMatch,
	renderBluefish,
	renderModular,
} from "./harness.ts";

const R = 25;
const W2JUT = 10;

// The pulley example from bluefishjs.org/examples, translated to the
// hyperscript API; examples/pulley.json is our variant.
// biome-ignore lint/suspicious/noExplicitAny: hyperscript component types
function pulleyDiagram(bf: BluefishModule): any {
	const pulleyCircle = (name: string) =>
		bf.Align({ name, alignment: "center" }, [
			bf.Circle({
				r: R,
				stroke: "#828282",
				"stroke-width": 3,
				fill: "#C1C1C1",
			}),
			bf.Circle({ r: 5, fill: "#555555" }),
		]);

	const weight = (width: number, height: number, label: string) =>
		bf.Align({ alignment: "center" }, [
			bf.Path({
				d: `M 10,0 l ${width - 20},0 l 10,${height} l ${-width},0 Z`,
				fill: "#545454",
				stroke: "#545454",
			}),
			bf.Text({ "font-size": "10", fill: "white" }, label),
		]);

	return [
		bf.Rect({
			name: "rect",
			height: 20,
			width: 9 * R,
			fill: "#C9C9C9",
			"stroke-width": 2,
		}),
		pulleyCircle("A"),
		pulleyCircle("B"),
		pulleyCircle("C"),
		bf.Distribute({ direction: "horizontal", spacing: -R }, [
			bf.Ref({ select: "A" }),
			bf.Ref({ select: "B" }),
		]),
		bf.Distribute({ direction: "horizontal", spacing: 0 }, [
			bf.Ref({ select: "B" }),
			bf.Ref({ select: "C" }),
		]),
		bf.Distribute({ direction: "vertical", spacing: 40 }, [
			bf.Ref({ select: "rect" }),
			bf.Ref({ select: "B" }),
		]),
		bf.Distribute({ direction: "vertical", spacing: 30 }, [
			bf.Ref({ select: "B" }),
			bf.Ref({ select: "A" }),
		]),
		bf.Distribute({ direction: "vertical", spacing: 50 }, [
			bf.Ref({ select: "B" }),
			bf.Ref({ select: "C" }),
		]),
		bf.Group({ name: "G" }, [
			bf.Ref({ select: "A" }),
			bf.Ref({ select: "B" }),
			bf.Ref({ select: "C" }),
		]),
		bf.Align({ alignment: "centerX" }, [
			bf.Ref({ select: "rect" }),
			bf.Ref({ select: "G" }),
		]),
		bf.Align({ alignment: "center" }, [
			bf.Ref({ select: "B" }),
			bf.Text({ x: R, y: -R }, "B"),
		]),
		bf.Align({ alignment: "center" }, [
			bf.Ref({ select: "A" }),
			bf.Text({ x: -R, y: -R }, "A"),
		]),
		bf.Align({ alignment: "center" }, [
			bf.Ref({ select: "C" }),
			bf.Text({ x: R, y: R }, "C"),
		]),
		bf.Line(
			{ source: [0, 0.5], target: [0.5, 0.5], name: "l1", stroke: "#774e32" },
			[bf.Ref({ select: "B" }), bf.Ref({ select: "A" })],
		),
		bf.Line(
			{ source: [1, 0.5], target: [0, 0.5], name: "l2", stroke: "#774e32" },
			[bf.Ref({ select: "B" }), bf.Ref({ select: "C" })],
		),
		bf.Line({ target: [1, 0.5], name: "l3", stroke: "#774e32" }, [
			bf.Ref({ select: "rect" }),
			bf.Ref({ select: "C" }),
		]),
		bf.StackH({ spacing: 5 }, [
			bf.Ref({ select: "l1" }),
			bf.Text({ name: "t1" }, "x"),
		]),
		bf.Distribute({ spacing: 5, direction: "horizontal" }, [
			bf.Ref({ select: "l2" }),
			bf.Text({ name: "t2" }, "y"),
		]),
		bf.Distribute({ spacing: 5, direction: "horizontal" }, [
			bf.Ref({ select: "l3" }),
			bf.Text({ name: "t3" }, "z"),
		]),
		bf.Align({ alignment: "centerY" }, [
			bf.Ref({ select: "t1" }),
			bf.Ref({ select: "t2" }),
			bf.Ref({ select: "t3" }),
		]),
		bf.StackH({ name: "w1" }, [
			weight(30, 30, "W1"),
			bf.Rect({ fill: "transparent", width: R * 2 - 10 }),
		]),
		bf.StackH({ name: "w2" }, [
			bf.Rect({ fill: "transparent", width: R + (R / 2 - 10) - W2JUT / 2 }),
			weight(R * 3 + W2JUT, 30, "W2"),
		]),
		bf.Distribute({ spacing: 50, direction: "vertical" }, [
			bf.Ref({ select: "C" }),
			bf.Ref({ select: "w2" }),
		]),
		bf.Align({ alignment: "left" }, [
			bf.Ref({ select: "A" }),
			bf.Ref({ select: "w2" }),
		]),
		bf.Align({ alignment: "centerX" }, [
			bf.Ref({ select: "A" }),
			bf.Ref({ select: "w1" }),
		]),
		bf.Align({ alignment: "centerY" }, [
			bf.Ref({ select: "w1" }),
			bf.Ref({ select: "w2" }),
		]),
		bf.Line({ source: [0, 0.5], name: "l4", stroke: "#774e32" }, [
			bf.Ref({ select: "A" }),
			bf.Ref({ select: "w1" }),
		]),
		bf.Line({ source: [1, 0.5], name: "l5", stroke: "#774e32" }, [
			bf.Ref({ select: "A" }),
			bf.Ref({ select: "w2" }),
		]),
		bf.Line({ source: [0.5, 0.5], name: "l6", stroke: "#774e32" }, [
			bf.Ref({ select: "C" }),
			bf.Ref({ select: "w2" }),
		]),
		bf.Distribute({ spacing: 5, direction: "horizontal" }, [
			bf.Ref({ select: "l4" }),
			bf.Text({ name: "t4" }, "p"),
		]),
		bf.Distribute({ spacing: 5, direction: "horizontal" }, [
			bf.Ref({ select: "l5" }),
			bf.Text({ name: "t5" }, "q"),
		]),
		bf.StackH({ spacing: 5 }, [
			bf.Ref({ select: "l6" }),
			bf.Text({ name: "t6" }, "s"),
		]),
		bf.Align({ alignment: "centerY" }, [
			bf.Ref({ select: "t6" }),
			bf.Ref({ select: "t5" }),
			bf.Ref({ select: "t4" }),
		]),
		pulleyCircle("Acopy"),
		pulleyCircle("Ccopy"),
		bf.Align({ alignment: "center" }, [
			bf.Ref({ select: "A" }),
			bf.Ref({ select: "Acopy" }),
		]),
		bf.Align({ alignment: "center" }, [
			bf.Ref({ select: "C" }),
			bf.Ref({ select: "Ccopy" }),
		]),
		bf.Line(
			{
				source: [0, 0.5],
				target: [0.5, 0.5],
				name: "l1copy",
				stroke: "#774e32",
			},
			[bf.Ref({ select: "B" }), bf.Ref({ select: "A" })],
		),
		pulleyCircle("Bcopy"),
		bf.Align({ alignment: "center" }, [
			bf.Ref({ select: "B" }),
			bf.Ref({ select: "Bcopy" }),
		]),
		bf.Line({ target: [0.5, 0.5], name: "l0", stroke: "#774e32" }, [
			bf.Ref({ select: "rect" }),
			bf.Ref({ select: "B" }),
		]),
		bf.Line({ source: [0.5, 0.5], name: "l6copy", stroke: "#774e32" }, [
			bf.Ref({ select: "C" }),
			bf.Ref({ select: "w2" }),
		]),
	];
}

describe("gallery: pulley", () => {
	it("matches Bluefish geometry", async () => {
		const reference = await renderBluefish(pulleyDiagram);
		const actual = renderModular(pulleyJson as Record<string, unknown>);
		expectShapesToMatch(actual, reference, 0.05);
	});
});
