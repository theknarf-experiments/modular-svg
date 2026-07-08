import { Canvas } from "@modular-svg/react";
import * as React from "react";

const R = 25;
const W2JUT = 10;

// A pulley: a large wheel with an axle dot, centered together
function PulleyCircle({ id }: { id: string }) {
	return (
		<align key={id} alignment="center">
			<circle r={R} stroke="#828282" stroke-width={3} fill="#C1C1C1" />
			<circle r={5} fill="#555555" />
		</align>
	);
}

// A trapezoid weight with its label centered on it
function Weight({
	width,
	height,
	children,
}: {
	width: number;
	height: number;
	children: string;
}) {
	return (
		<align alignment="center">
			<path
				d={`M 10,0 l ${width - 20},0 l 10,${height} l ${-width},0 Z`}
				fill="#545454"
				stroke="#545454"
			/>
			{/* effective dims: measured at 14px, height from the 10px prop */}
			<text font-size={10} fill="white" width={children.length * 7} height={10}>
				{children}
			</text>
		</align>
	);
}

// TypeScript resolves the line tag to SVG's (whose target is a string), so
// ropes go through createElement - the reconciler sees the same line tag
function Rope(props: {
	id: string;
	from: string;
	to: string;
	source?: number[];
	target?: number[];
}) {
	return React.createElement(
		"line",
		{
			key: props.id,
			stroke: "#774e32",
			source: props.source,
			target: props.target,
		},
		React.createElement("ref", { target: props.from }),
		React.createElement("ref", { target: props.to }),
	);
}

function RopeLabel({ id, children }: { id: string; children: string }) {
	return (
		<text key={id} font-size={14}>
			{children}
		</text>
	);
}

export function PulleyDiagram() {
	return (
		<Canvas
			style={{
				border: "1px solid #ddd",
				borderRadius: "8px",
				display: "inline-block",
			}}
			margin={15}
		>
			<group>
				<rect
					key="rect"
					height={20}
					width={9 * R}
					fill="#C9C9C9"
					stroke-width={2}
				/>
				<PulleyCircle id="A" />
				<PulleyCircle id="B" />
				<PulleyCircle id="C" />

				<distribute axis="x" spacing={-R}>
					<ref target="A" />
					<ref target="B" />
				</distribute>
				<distribute axis="x" spacing={0}>
					<ref target="B" />
					<ref target="C" />
				</distribute>
				<distribute axis="y" spacing={40}>
					<ref target="rect" />
					<ref target="B" />
				</distribute>
				<distribute axis="y" spacing={30}>
					<ref target="B" />
					<ref target="A" />
				</distribute>
				<distribute axis="y" spacing={50}>
					<ref target="B" />
					<ref target="C" />
				</distribute>

				<group key="G">
					<ref target="A" />
					<ref target="B" />
					<ref target="C" />
				</group>
				<align alignment="centerX">
					<ref target="rect" />
					<ref target="G" />
				</align>

				<align alignment="center">
					<ref target="B" />
					<RopeLabel id="tB">B</RopeLabel>
				</align>
				<align alignment="center">
					<ref target="A" />
					<RopeLabel id="tA">A</RopeLabel>
				</align>
				<align alignment="center">
					<ref target="C" />
					<RopeLabel id="tC">C</RopeLabel>
				</align>

				<Rope id="l1" from="B" to="A" source={[0, 0.5]} target={[0.5, 0.5]} />
				<Rope id="l2" from="B" to="C" source={[1, 0.5]} target={[0, 0.5]} />
				<Rope id="l3" from="rect" to="C" target={[1, 0.5]} />

				<stackH spacing={5}>
					<ref target="l1" />
					<RopeLabel id="t1">x</RopeLabel>
				</stackH>
				<distribute axis="x" spacing={5}>
					<ref target="l2" />
					<RopeLabel id="t2">y</RopeLabel>
				</distribute>
				<distribute axis="x" spacing={5}>
					<ref target="l3" />
					<RopeLabel id="t3">z</RopeLabel>
				</distribute>
				<align alignment="centerY">
					<ref target="t1" />
					<ref target="t2" />
					<ref target="t3" />
				</align>

				<stackH key="w1">
					<Weight width={30} height={30}>
						W1
					</Weight>
					<rect fill="transparent" width={R * 2 - 10} stroke-width={0} />
				</stackH>
				<stackH key="w2">
					<rect
						fill="transparent"
						width={R + (R / 2 - 10) - W2JUT / 2}
						stroke-width={0}
					/>
					<Weight width={R * 3 + W2JUT} height={30}>
						W2
					</Weight>
				</stackH>
				<distribute axis="y" spacing={50}>
					<ref target="C" />
					<ref target="w2" />
				</distribute>
				<align alignment="left">
					<ref target="A" />
					<ref target="w2" />
				</align>
				<align alignment="centerX">
					<ref target="A" />
					<ref target="w1" />
				</align>
				{/* w1 rides with w2 (in Bluefish an undefined-height rect
				    disqualifies w1 as the anchor; here the anchor goes first) */}
				<align alignment="centerY">
					<ref target="w2" />
					<ref target="w1" />
				</align>

				<Rope id="l4" from="A" to="w1" source={[0, 0.5]} />
				<Rope id="l5" from="A" to="w2" source={[1, 0.5]} />
				<Rope id="l6" from="C" to="w2" source={[0.5, 0.5]} />

				<distribute axis="x" spacing={5}>
					<ref target="l4" />
					<RopeLabel id="t4">p</RopeLabel>
				</distribute>
				<distribute axis="x" spacing={5}>
					<ref target="l5" />
					<RopeLabel id="t5">q</RopeLabel>
				</distribute>
				<stackH spacing={5}>
					<ref target="l6" />
					<RopeLabel id="t6">s</RopeLabel>
				</stackH>
				<align alignment="centerY">
					<ref target="t6" />
					<ref target="t5" />
					<ref target="t4" />
				</align>

				{/* Overdraws to make the diagram pretty */}
				<PulleyCircle id="Acopy" />
				<PulleyCircle id="Ccopy" />
				<align alignment="center">
					<ref target="A" />
					<ref target="Acopy" />
				</align>
				<align alignment="center">
					<ref target="C" />
					<ref target="Ccopy" />
				</align>
				<Rope
					id="l1copy"
					from="B"
					to="A"
					source={[0, 0.5]}
					target={[0.5, 0.5]}
				/>
				<PulleyCircle id="Bcopy" />
				<align alignment="center">
					<ref target="B" />
					<ref target="Bcopy" />
				</align>
				<Rope id="l0" from="rect" to="B" target={[0.5, 0.5]} />
				<Rope id="l6copy" from="C" to="w2" source={[0.5, 0.5]} />
			</group>
		</Canvas>
	);
}
