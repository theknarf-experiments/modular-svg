import { Graphic } from "@modular-svg/react";

export type VennSet = { label: string };

export type VennDiagramProps = {
	/** two or three sets */
	sets: VennSet[];
	radius?: number;
	fontSize?: number;
};

const circleId = (label: string) => `set-${label}`;

// Overlapping translucent circles. Positions are computed (a Venn is
// inherently coordinate-based), colors come from DistinctColors, and the
// translucency lets the intersections show through.
export function VennDiagram({
	sets,
	radius = 75,
	fontSize = 15,
}: VennDiagramProps) {
	const two = sets.length === 2;
	// centers and the outward direction for each set's label
	const layout = two
		? [
				{ cx: radius * 0.85, cy: radius, dir: [-1, 0] },
				{ cx: radius * 1.65, cy: radius, dir: [1, 0] },
			]
		: [
				{ cx: radius * 1.25, cy: radius * 0.85, dir: [0, -1] },
				{ cx: radius * 0.85, cy: radius * 1.55, dir: [-0.87, 0.5] },
				{ cx: radius * 1.65, cy: radius * 1.55, dir: [0.87, 0.5] },
			];

	const placed = sets.slice(0, layout.length).map((set, i) => {
		const { cx, cy, dir } = layout[i];
		const lx = cx + dir[0] * (radius + 14);
		const ly = cy + dir[1] * (radius + 14);
		// text x/y is top-left; center the label on its point
		const w = set.label.length * fontSize * 0.5;
		return { ...set, cx, cy, tx: lx - w / 2, ty: ly - fontSize / 2 };
	});

	return (
		<Graphic
			style={{
				border: "1px solid #ddd",
				borderRadius: "8px",
				display: "inline-block",
			}}
			margin={16}
		>
			<group>
				{placed.map((p) => (
					<circle
						key={circleId(p.label)}
						cx={p.cx}
						cy={p.cy}
						r={radius}
						stroke="#555"
						stroke-width={1.5}
						fill-opacity={0.45}
					/>
				))}
				{placed.map((p) => (
					<text
						key={`label-${p.label}`}
						x={p.tx}
						y={p.ty}
						font-size={fontSize}
						fill="#222"
					>
						{p.label}
					</text>
				))}
				<distinctColors saturation={0.6} lightness={0.55}>
					{placed.map((p) => (
						<ref key={p.label} target={circleId(p.label)} />
					))}
				</distinctColors>
			</group>
		</Graphic>
	);
}
