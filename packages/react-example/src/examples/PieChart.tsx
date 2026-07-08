import { Canvas } from "@modular-svg/react";

export type Slice = { label: string; value: number };

export type PieChartProps = {
	data: Slice[];
	radius?: number;
	/** inner radius as a fraction of radius (>0 makes a donut) */
	donut?: number;
	fontSize?: number;
};

const sliceId = (label: string) => `slice-${label}`;
const swatchId = (label: string) => `swatch-${label}`;

// Slices auto-pick distinct colors (DistinctColors), and each legend swatch
// copies its slice's color (SameColor) - no colors are chosen in the markup.
export function PieChart({
	data,
	radius = 90,
	donut = 0,
	fontSize = 13,
}: PieChartProps) {
	const total = data.reduce((s, d) => s + d.value, 0);
	let acc = 0;
	const slices = data.map((d) => {
		const start = (acc / total) * 360;
		acc += d.value;
		const end = (acc / total) * 360;
		return { ...d, start, end, pct: Math.round((d.value / total) * 100) };
	});

	return (
		<Canvas
			style={{
				border: "1px solid #ddd",
				borderRadius: "8px",
				display: "inline-block",
			}}
			margin={14}
		>
			<group>
				<group key="pie">
					{slices.map((s) => (
						<arc
							key={sliceId(s.label)}
							r={radius}
							innerR={donut * radius}
							startAngle={s.start}
							endAngle={s.end}
							stroke="white"
							stroke-width={2}
						/>
					))}
				</group>

				<stackV key="legend" spacing={8} alignment="left">
					{slices.map((s) => (
						<stackH key={`leg-${s.label}`} spacing={8} alignment="centerY">
							<rect key={swatchId(s.label)} width={14} height={14} />
							<text font-size={fontSize}>{`${s.label} - ${s.pct}%`}</text>
						</stackH>
					))}
				</stackV>
				<distribute axis="x" spacing={28}>
					<ref target="pie" />
					<ref target="legend" />
				</distribute>
				<align alignment="centerY">
					<ref target="pie" />
					<ref target="legend" />
				</align>

				{/* Color constraints (declared after the nodes they reference) */}
				<distinctColors saturation={0.55} lightness={0.55}>
					{slices.map((s) => (
						<ref key={s.label} target={sliceId(s.label)} />
					))}
				</distinctColors>
				{slices.map((s) => (
					<sameColor key={`sc-${s.label}`}>
						<ref target={sliceId(s.label)} />
						<ref target={swatchId(s.label)} />
					</sameColor>
				))}
			</group>
		</Canvas>
	);
}
