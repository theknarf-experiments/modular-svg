import { Canvas } from "@modular-svg/react";
import "./modular-svg.d.ts";

/**
 * Interactive Planet Example with Size Control
 */
export function InteractivePlanetExample() {
	const [scale, setScale] = React.useState(1);
	const [spacing, setSpacing] = React.useState(50);

	return (
		<div style={{ fontFamily: "system-ui, sans-serif" }}>
			<h2>Interactive Planet Example</h2>
			<p style={{ color: "#666", fontSize: "14px" }}>
				Adjust the scale and spacing to explore the layout
			</p>

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
						min="10"
						max="100"
						step="5"
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
					backgroundColor: "#0a0a0a",
				}}
				margin={20}
			>
				<stackH spacing={spacing}>
					<circle r={15 * scale} fill="#EBE3CF" stroke="#666" strokeWidth={2} />
					<circle r={36 * scale} fill="#DC933C" stroke="#666" strokeWidth={2} />
					<circle r={38 * scale} fill="#179DD7" stroke="#666" strokeWidth={2} />
					<circle r={21 * scale} fill="#F1CF8E" stroke="#666" strokeWidth={2} />
				</stackH>
			</Canvas>
		</div>
	);
}

// Need to import React for useState
import * as React from "react";
