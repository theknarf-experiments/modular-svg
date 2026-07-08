import { Canvas } from "@modular-svg/react";
import * as React from "react";

// The span relation's JSX tag collides with HTML <span> in TypeScript's
// eyes, so it goes through createElement (the reconciler sees the same tag)
function Span(props: { axis: "x" | "y"; children?: React.ReactNode }) {
	return React.createElement("span", props);
}

const FONT = 14;

// A padded cell: a transparent background wrapping its content
function Pad({ id, children }: { id: string; children: React.ReactNode }) {
	return (
		<background key={id} padding={5} fill="transparent" stroke-width={0}>
			{children}
		</background>
	);
}

// A table cell border: a rect spanning a horizontal and a vertical guide
function CellBorder({
	id,
	horizontal,
	vertical,
}: {
	id: string;
	horizontal: string;
	vertical: string;
}) {
	return (
		<group>
			<rect key={id} fill="transparent" stroke="#40A03F" stroke-width={1} />
			<Span axis="x">
				<ref target={horizontal} />
				<ref target={id} />
			</Span>
			<Span axis="y">
				<ref target={vertical} />
				<ref target={id} />
			</Span>
		</group>
	);
}

function Label({ children }: { children: string }) {
	return <text font-size={FONT}>{children}</text>;
}

const rows = [0, 1, 2, 3, 4, 5].map((i) => `col0-row${i}`);

export function BakingRecipe() {
	return (
		<Canvas
			style={{
				border: "1px solid #ddd",
				borderRadius: "8px",
				display: "inline-block",
				maxWidth: "100%",
				overflow: "auto",
			}}
			margin={10}
		>
			<group>
				<background
					key="outer"
					padding={50}
					fill="#7CD4AC"
					opacity={0.3}
					stroke-width={0}
				>
					<background
						key="recipeTable"
						padding={0}
						stroke="#40A03F"
						fill="#FFFFFF"
						stroke-width={3}
					>
						<Pad id="title">
							<Label>
								Preheat oven to 325°F (160°C) and butter a 9x13-in. baking pan
							</Label>
						</Pad>
						<Pad id="col0-row0">
							<Label>6 oz. (170 g) 70% cacao chocolate</Label>
						</Pad>
						<Pad id="col0-row1">
							<Label>6 oz. (170 g) butter</Label>
						</Pad>
						<Pad id="col0-row2">
							<Label>1-1/2 cup (300 g) granulated sugar </Label>
						</Pad>
						<Pad id="col0-row3">
							<stackV>
								<Label>3 large eggs</Label>
							</stackV>
						</Pad>
						<Pad id="col0-row4">
							<Label>1 tsp. (5 mL) vanilla extract</Label>
						</Pad>
						<Pad id="col0-row5">
							<Label>1 cup (125 g) all-purpose flour</Label>
						</Pad>
						<Pad id="col1-row0_1">
							<Label>melt in double boiler</Label>
						</Pad>
						<Pad id="col1_2-row0_2">
							<Label>stir in</Label>
						</Pad>
						<Pad id="col1_2-row3_4">
							<Label>lightly beat</Label>
						</Pad>
						<Pad id="col3-row0_5">
							<Label>stir in</Label>
						</Pad>
						<Pad id="col4-row0_5">
							<Label>stir in</Label>
						</Pad>
						<Pad id="col5-row0_5">
							<Label>bake 325°F (160°C) for 35 min.</Label>
						</Pad>

						<stackV alignment="left" spacing={0}>
							<ref target="title" />
							{rows.map((r) => (
								<ref key={`stack-${r}`} target={r} />
							))}
						</stackV>
						<group key="col0">
							{rows.map((r) => (
								<ref key={`col0-${r}`} target={r} />
							))}
						</group>

						<distribute axis="x" spacing={0}>
							<ref target="col0" />
							<ref target="col1-row0_1" />
						</distribute>
						<align alignment="centerY">
							<group>
								<ref target="col0-row0" />
								<ref target="col0-row1" />
							</group>
							<ref target="col1-row0_1" />
						</align>
						<distribute axis="x" spacing={0}>
							<ref target="col1-row0_1" />
							<ref target="col1_2-row0_2" />
						</distribute>
						<align alignment="centerY">
							<group>
								<ref target="col0-row0" />
								<ref target="col0-row1" />
								<ref target="col0-row2" />
							</group>
							<ref target="col1_2-row0_2" />
						</align>
						<align alignment="centerY">
							<group>
								<ref target="col0-row3" />
								<ref target="col0-row4" />
							</group>
							<ref target="col1_2-row3_4" />
						</align>
						<align alignment="left">
							<group>
								<ref target="col1-row0_1" />
								<ref target="col1_2-row0_2" />
							</group>
							<ref target="col1_2-row3_4" />
						</align>
						<distribute axis="x" spacing={0}>
							<group>
								<ref target="col1-row0_1" />
								<ref target="col1_2-row0_2" />
								<ref target="col1_2-row3_4" />
							</group>
							<ref target="col3-row0_5" />
						</distribute>
						<align alignment="centerY">
							<group>
								<ref target="col0-row0" />
								<ref target="col0-row4" />
							</group>
							<ref target="col3-row0_5" />
						</align>
						<distribute axis="x" spacing={0}>
							<group>
								<ref target="col3-row0_5" />
							</group>
							<ref target="col4-row0_5" />
						</distribute>
						<align alignment="centerY">
							<group>
								<ref target="col0-row0" />
								<ref target="col0-row5" />
							</group>
							<ref target="col4-row0_5" />
						</align>
						<distribute axis="x" spacing={0}>
							<group>
								<ref target="col4-row0_5" />
							</group>
							<ref target="col5-row0_5" />
						</distribute>
						<align alignment="centerY">
							<group>
								<ref target="col0-row0" />
								<ref target="col0-row5" />
							</group>
							<ref target="col5-row0_5" />
						</align>

						{rows.map((r, i) => (
							<CellBorder
								key={`cb-${r}`}
								id={`cb${i + 1}`}
								horizontal="col0"
								vertical={r}
							/>
						))}

						<group key="col1_2">
							<ref target="col1-row0_1" />
							<ref target="col1_2-row0_2" />
							<ref target="col1_2-row3_4" />
						</group>
						<group key="col1_3">
							<ref target="col1_2" />
							<ref target="col3-row0_5" />
						</group>
						<group key="row0_1">
							<ref target="col0-row0" />
							<ref target="col0-row1" />
						</group>
						<group key="row0_2">
							<ref target="col0-row0" />
							<ref target="col0-row2" />
						</group>
						<group key="row3_4">
							<ref target="col0-row3" />
							<ref target="col0-row4" />
						</group>
						<group key="row0_5">
							<ref target="col0-row0" />
							<ref target="col0-row5" />
						</group>
						<group key="row0_4">
							<ref target="col0-row0" />
							<ref target="col0-row4" />
						</group>
						<CellBorder id="cb7" horizontal="col1-row0_1" vertical="row0_1" />
						<CellBorder id="cb8" horizontal="col1_2" vertical="row0_2" />
						<CellBorder id="cb9" horizontal="col1_2" vertical="row3_4" />
						<CellBorder id="cb10" horizontal="col1_3" vertical="row0_4" />
						<CellBorder id="cb11" horizontal="col5-row0_5" vertical="row0_5" />
						<group key="col0_5">
							<ref target="col0-row0" />
							<ref target="col5-row0_5" />
						</group>
						<CellBorder id="cb12" horizontal="col0_5" vertical="title" />
					</background>
				</background>

				<text key="recipeName" font-size={FONT}>
					Dark Chocolate Brownies (makes 24 squares)
				</text>
				<stackV spacing={10} alignment="left">
					<ref target="recipeName" />
					<ref target="recipeTable" />
				</stackV>
			</group>
		</Canvas>
	);
}
