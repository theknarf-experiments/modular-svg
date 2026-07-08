import { Canvas } from "@modular-svg/react";
import { useState } from "react";

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
const rowLabelId = (label: string) => `leglabel-${label}`;

// The legend swatches are the palette: DistinctColors gives each a base
// color, and every slice derives its color from its swatch - SameColor
// normally, or Darken/Lighten while hovering, so the hovered slice pops and
// the rest recede. Hover works from either the slice or the legend.
export function PieChart({
	data,
	radius = 90,
	donut = 0,
	fontSize = 13,
}: PieChartProps) {
	const [hovered, setHovered] = useState<string | null>(null);
	const total = data.reduce((s, d) => s + d.value, 0);
	let acc = 0;
	const slices = data.map((d) => {
		const start = (acc / total) * 360;
		acc += d.value;
		const end = (acc / total) * 360;
		return { ...d, start, end, pct: Math.round((d.value / total) * 100) };
	});

	const hoverProps = (label: string) => ({
		onMouseEnter: () => setHovered(label),
		onMouseLeave: () => setHovered(null),
	});

	return (
		<Canvas
			style={{
				border: "1px solid #ddd",
				borderRadius: "8px",
				display: "inline-block",
				cursor: "pointer",
			}}
			margin={14}
		>
			<group>
				<group key="pie">
					{slices.map((s) => {
						const on = hovered === s.label;
						return (
							<arc
								key={sliceId(s.label)}
								r={radius}
								innerR={donut * radius}
								startAngle={s.start}
								endAngle={s.end}
								stroke={on ? "#333" : "white"}
								stroke-width={on ? 3 : 2}
								{...hoverProps(s.label)}
							/>
						);
					})}
				</group>

				<stackV key="legend" spacing={8} alignment="left">
					{slices.map((s) => (
						<stackH key={`leg-${s.label}`} spacing={8} alignment="centerY">
							<rect
								key={swatchId(s.label)}
								width={14}
								height={14}
								{...hoverProps(s.label)}
							/>
							<text
								key={rowLabelId(s.label)}
								font-size={fontSize}
								font-weight={hovered === s.label ? 700 : 400}
								{...hoverProps(s.label)}
							>
								{`${s.label} - ${s.pct}%`}
							</text>
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

				{/* Colors (declared after the nodes they reference). The swatches
				    hold the base palette; slices derive from them. */}
				<distinctColors saturation={0.55} lightness={0.6}>
					{slices.map((s) => (
						<ref key={s.label} target={swatchId(s.label)} />
					))}
				</distinctColors>
				{slices.map((s) => {
					if (hovered === s.label) {
						return (
							<darken key={`sh-${s.label}`} amount={0.18}>
								<ref target={swatchId(s.label)} />
								<ref target={sliceId(s.label)} />
							</darken>
						);
					}
					if (hovered !== null) {
						return (
							<lighten key={`sh-${s.label}`} amount={0.18}>
								<ref target={swatchId(s.label)} />
								<ref target={sliceId(s.label)} />
							</lighten>
						);
					}
					return (
						<sameColor key={`sh-${s.label}`}>
							<ref target={swatchId(s.label)} />
							<ref target={sliceId(s.label)} />
						</sameColor>
					);
				})}
			</group>
		</Canvas>
	);
}
