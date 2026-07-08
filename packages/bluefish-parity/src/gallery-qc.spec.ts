import { describe, it } from "vitest";
import qcJson from "../../../examples/qc.json";
import {
	type BluefishModule,
	expectShapesToMatch,
	renderBluefish,
	renderModular,
} from "./harness.ts";

// The quantum-circuit-equivalence example from bluefishjs.org/examples,
// translated to the hyperscript API; examples/qc.json is our variant.
// biome-ignore lint/suspicious/noExplicitAny: hyperscript component types
function qcDiagram(bf: BluefishModule): any {
	// biome-ignore lint/suspicious/noExplicitAny: hyperscript children
	const wire = (children: any[], depth = 1) =>
		bf.Align({ alignment: "centerLeft" }, [
			bf.Rect({ height: 3, width: depth * 60 + 30, fill: "black" }),
			bf.StackH({}, [bf.Rect({ fill: "transparent", width: 10 }), ...children]),
		]);

	// biome-ignore lint/suspicious/noExplicitAny: hyperscript children
	const wireSymbol = (children: any[]) =>
		bf.Align({ alignment: "center" }, [
			bf.Rect({ height: 50, width: 50, fill: "transparent" }),
			...children,
		]);

	const boxedSymbol = (ch: string, name?: string) =>
		bf.Background(
			{
				...(name ? { name } : {}),
				background: () =>
					bf.Rect({
						height: 50,
						width: 50,
						fill: "white",
						stroke: "black",
						"stroke-width": 3,
					}),
			},
			bf.Text(
				{
					"font-family": "serif",
					x: 0,
					y: 0,
					fill: "black",
					"font-size": "30",
					dy: "5",
					"font-style": "italic",
				},
				ch,
			),
		);

	const oplus = (name: string) =>
		bf.Group({ name }, [
			bf.Align({ alignment: "center" }, [
				bf.Circle({
					r: 15,
					fill: "transparent",
					stroke: "black",
					"stroke-width": 3,
				}),
				bf.Rect({ height: 3, width: 30, fill: "black" }),
				bf.Rect({ height: 30, width: 3, fill: "black" }),
			]),
		]);

	const controlDot = (name: string) => bf.Circle({ name, r: 5, fill: "black" });

	return [
		bf.StackH({ alignment: "centerY", spacing: 25 }, [
			bf.StackV({}, [
				wire([wireSymbol([controlDot("c1")])]),
				wire([boxedSymbol("Z", "z")]),
			]),
			bf.Text({ "font-size": "40", "font-weight": 300 }, "≡"),
			bf.StackV({}, [
				wire([wireSymbol([]), wireSymbol([controlDot("c2")])], 3),
				wire(
					[boxedSymbol("H"), wireSymbol([oplus("plus")]), boxedSymbol("H")],
					3,
				),
			]),
			bf.Text({ name: "plusDescription" }, "This is a controlled-NOT."),
		]),
		bf.Line({}, [bf.Ref({ select: "c1" }), bf.Ref({ select: "z" })]),
		bf.Line({}, [bf.Ref({ select: "c2" }), bf.Ref({ select: "plus" })]),
		bf.Background(
			{
				background: () => bf.Rect({ fill: "rgba(255,200,0,0.333)", rx: "10" }),
			},
			bf.Ref({ select: "plus" }),
		),
		bf.Background(
			{
				background: () => bf.Rect({ fill: "rgba(255,200,0,0.333)", rx: "10" }),
			},
			bf.Ref({ select: "plusDescription" }),
		),
	];
}

describe("gallery: quantum circuit equivalence", () => {
	it("matches Bluefish geometry", async () => {
		const reference = await renderBluefish(qcDiagram);
		const actual = renderModular(qcJson as Record<string, unknown>);
		expectShapesToMatch(actual, reference, 0.05);
	});
});
