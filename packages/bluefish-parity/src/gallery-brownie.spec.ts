import { describe, it } from "vitest";
import brownieJson from "../../../examples/brownie.json";
import {
	type BluefishModule,
	expectShapesToMatch,
	renderBluefish,
	renderModular,
} from "./harness.ts";

// The baking-recipe example from bluefishjs.org/examples, translated 1:1 to
// the hyperscript API as the reference; examples/brownie.json is our variant.
// biome-ignore lint/suspicious/noExplicitAny: hyperscript component types
function brownieDiagram(bf: BluefishModule): any {
	// biome-ignore lint/suspicious/noExplicitAny: hyperscript children
	const pad = (name: string, child: any) =>
		bf.Background(
			{ name, padding: 5, background: () => bf.Rect({ fill: "transparent" }) },
			child,
		);

	let cbCount = 0;
	const cellBorder = (horizontal: string, vertical: string) => {
		cbCount++;
		const rect = `cb${cbCount}`;
		return bf.Group({}, [
			bf.Rect({
				name: rect,
				fill: "transparent",
				stroke: "#40A03F",
				"stroke-width": 1,
			}),
			bf.LayoutFunction(
				{
					// biome-ignore lint/suspicious/noExplicitAny: bluefish bbox
					f: ({ left, width, right }: any) => ({ left, width, right }),
				},
				[bf.Ref({ select: horizontal }), bf.Ref({ select: rect })],
			),
			bf.LayoutFunction(
				{
					// biome-ignore lint/suspicious/noExplicitAny: bluefish bbox
					f: ({ top, height, bottom }: any) => ({ top, height, bottom }),
				},
				[bf.Ref({ select: vertical }), bf.Ref({ select: rect })],
			),
		]);
	};

	const group = (name: string | undefined, targets: string[]) =>
		bf.Group(
			name ? { name } : {},
			targets.map((t) => bf.Ref({ select: t })),
		);
	const distributeH = (
		// biome-ignore lint/suspicious/noExplicitAny: hyperscript children
		a: any,
		// biome-ignore lint/suspicious/noExplicitAny: hyperscript children
		b: any,
	) => bf.Distribute({ direction: "horizontal", spacing: 0 }, [a, b]);
	// biome-ignore lint/suspicious/noExplicitAny: hyperscript children
	const align = (alignment: string, a: any, b: any) =>
		// biome-ignore lint/suspicious/noExplicitAny: alignment keyword union
		bf.Align({ alignment: alignment as any }, [a, b]);

	const rows = [0, 1, 2, 3, 4, 5].map((i) => `col0-row${i}`);

	return [
		bf.Background(
			{
				padding: 50,
				x: 0,
				y: 0,
				background: () => bf.Rect({ fill: "#7CD4AC", opacity: 0.3 }),
			},
			bf.Background(
				{
					padding: 0,
					name: "recipeTable",
					background: () =>
						bf.Rect({ stroke: "#40A03F", fill: "#FFFFFF", "stroke-width": 3 }),
				},
				[
					pad(
						"title",
						bf.Text(
							"Preheat oven to 325°F (160°C) and butter a 9x13-in. baking pan",
						),
					),
					pad("col0-row0", bf.Text("6 oz. (170 g) 70% cacao chocolate")),
					pad("col0-row1", bf.Text("6 oz. (170 g) butter")),
					pad("col0-row2", bf.Text("1-1/2 cup (300 g) granulated sugar ")),
					pad("col0-row3", bf.StackV({}, bf.Text("3 large eggs"))),
					pad("col0-row4", bf.Text("1 tsp. (5 mL) vanilla extract")),
					pad("col0-row5", bf.Text("1 cup (125 g) all-purpose flour")),
					pad("col1-row0_1", bf.Text("melt in double boiler")),
					pad("col1_2-row0_2", bf.Text("stir in")),
					pad("col1_2-row3_4", bf.Text("lightly beat")),
					pad("col3-row0_5", bf.Text("stir in")),
					pad("col4-row0_5", bf.Text("stir in")),
					pad("col5-row0_5", bf.Text("bake 325°F (160°C) for 35 min.")),
					bf.StackV({ alignment: "left", spacing: 0 }, [
						bf.Ref({ select: "title" }),
						...rows.map((r) => bf.Ref({ select: r })),
					]),
					group("col0", rows),
					distributeH(
						bf.Ref({ select: "col0" }),
						bf.Ref({ select: "col1-row0_1" }),
					),
					align(
						"centerY",
						group(undefined, ["col0-row0", "col0-row1"]),
						bf.Ref({ select: "col1-row0_1" }),
					),
					distributeH(
						bf.Ref({ select: "col1-row0_1" }),
						bf.Ref({ select: "col1_2-row0_2" }),
					),
					align(
						"centerY",
						group(undefined, ["col0-row0", "col0-row1", "col0-row2"]),
						bf.Ref({ select: "col1_2-row0_2" }),
					),
					align(
						"centerY",
						group(undefined, ["col0-row3", "col0-row4"]),
						bf.Ref({ select: "col1_2-row3_4" }),
					),
					align(
						"left",
						group(undefined, ["col1-row0_1", "col1_2-row0_2"]),
						bf.Ref({ select: "col1_2-row3_4" }),
					),
					distributeH(
						group(undefined, ["col1-row0_1", "col1_2-row0_2", "col1_2-row3_4"]),
						bf.Ref({ select: "col3-row0_5" }),
					),
					align(
						"centerY",
						group(undefined, ["col0-row0", "col0-row4"]),
						bf.Ref({ select: "col3-row0_5" }),
					),
					distributeH(
						group(undefined, ["col3-row0_5"]),
						bf.Ref({ select: "col4-row0_5" }),
					),
					align(
						"centerY",
						group(undefined, ["col0-row0", "col0-row5"]),
						bf.Ref({ select: "col4-row0_5" }),
					),
					distributeH(
						group(undefined, ["col4-row0_5"]),
						bf.Ref({ select: "col5-row0_5" }),
					),
					align(
						"centerY",
						group(undefined, ["col0-row0", "col0-row5"]),
						bf.Ref({ select: "col5-row0_5" }),
					),
					...rows.map((r) => cellBorder("col0", r)),
					group("col1_2", ["col1-row0_1", "col1_2-row0_2", "col1_2-row3_4"]),
					group("col1_3", ["col1_2", "col3-row0_5"]),
					group("row0_1", ["col0-row0", "col0-row1"]),
					group("row0_2", ["col0-row0", "col0-row2"]),
					group("row3_4", ["col0-row3", "col0-row4"]),
					group("row0_5", ["col0-row0", "col0-row5"]),
					group("row0_4", ["col0-row0", "col0-row4"]),
					cellBorder("col1-row0_1", "row0_1"),
					cellBorder("col1_2", "row0_2"),
					cellBorder("col1_2", "row3_4"),
					cellBorder("col1_3", "row0_4"),
					cellBorder("col5-row0_5", "row0_5"),
					group("col0_5", ["col0-row0", "col5-row0_5"]),
					cellBorder("col0_5", "title"),
				],
			),
		),
		bf.Text(
			{ name: "recipeName" },
			"Dark Chocolate Brownies (makes 24 squares)",
		),
		bf.StackV({ spacing: 10, alignment: "left" }, [
			bf.Ref({ select: "recipeName" }),
			bf.Ref({ select: "recipeTable" }),
		]),
	];
}

describe("gallery: baking recipe (brownie)", () => {
	it("matches Bluefish geometry", async () => {
		const reference = await renderBluefish(brownieDiagram);
		const actual = renderModular(brownieJson as Record<string, unknown>);
		expectShapesToMatch(actual, reference, 0.05);
	});
});
