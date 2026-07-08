import { Canvas } from "@modular-svg/react";
import { useState } from "react";

const data = [
	{ id: "mon", value: 30, fill: "#60a5fa" },
	{ id: "tue", value: 55, fill: "#34d399" },
	{ id: "wed", value: 80, fill: "#fbbf24" },
	{ id: "thu", value: 45, fill: "#f87171" },
	{ id: "fri", value: 65, fill: "#a78bfa" },
];

function Bar({
	id,
	height,
	fill,
}: {
	id: string;
	height: number;
	fill: string;
}) {
	return (
		<rect
			key={id}
			width={30}
			height={height}
			fill={fill}
			stroke="#333"
			stroke-width={1}
		/>
	);
}

export function BarChart() {
	const [scale, setScale] = useState(1);
	const [spacing, setSpacing] = useState(15);

	const peak = data.reduce((a, b) => (b.value > a.value ? b : a));

	return (
		<div>
			<div style={{ marginBottom: "1rem" }}>
				<label style={{ display: "block", marginBottom: "0.5rem" }}>
					Scale: {scale.toFixed(1)}x
					<input
						type="range"
						min="0.5"
						max="2"
						step="0.1"
						value={scale}
						onChange={(e) => setScale(Number(e.target.value))}
						style={{ marginLeft: "1rem", width: "200px" }}
					/>
				</label>
				<label style={{ display: "block", marginBottom: "0.5rem" }}>
					Spacing: {spacing}px
					<input
						type="range"
						min="5"
						max="40"
						value={spacing}
						onChange={(e) => setSpacing(Number(e.target.value))}
						style={{ marginLeft: "1rem", width: "200px" }}
					/>
				</label>
			</div>
			<Canvas
				style={{
					border: "1px solid #ddd",
					borderRadius: "8px",
					display: "inline-block",
				}}
				margin={20}
			>
				<group>
					<background
						padding={15}
						fill="#f9f9f9"
						stroke="#ddd"
						stroke-width={1}
					>
						<stackH key="bars" spacing={spacing} alignment="bottom">
							{data.map((d) => (
								<Bar
									key={d.id}
									id={d.id}
									height={d.value * scale}
									fill={d.fill}
								/>
							))}
						</stackH>
					</background>

					<align key="alignPeak" axis="x" alignment="center">
						<text key="peakLabel" fill="#333">
							Peak
						</text>
						<ref target={peak.id} />
					</align>

					<distribute key="distPeak" axis="y" spacing={25}>
						<ref target="peakLabel" />
						<ref target={peak.id} />
					</distribute>

					<arrow key="arrowPeak" stroke="#333" stroke-width={1}>
						<ref target="peakLabel" />
						<ref target={peak.id} />
					</arrow>
				</group>
			</Canvas>
		</div>
	);
}
