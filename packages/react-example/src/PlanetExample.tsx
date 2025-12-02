import { Canvas } from "@modular-svg/react";
import "./modular-svg.d.ts";

/**
 * Planet Example - Adapted from examples/planet.json
 *
 * This demonstrates a horizontal layout of planets with proper spacing.
 *
 * Note: Some features from the original JSON are not yet available in JSX:
 * - Background container with padding
 * - Align (for centering text labels)
 * - Distribute (for vertical spacing)
 * - Text elements
 * - Arrow connectors
 * - Ref (references to other elements)
 *
 * This simplified version shows what's currently possible.
 */
export function PlanetExample() {
	return (
		<div style={{ fontFamily: "system-ui, sans-serif" }}>
			<h2>Planet Example</h2>
			<p style={{ color: "#666", fontSize: "14px" }}>
				Inner planets (Mercury, Venus, Earth, Mars) arranged horizontally with
				vertical centering
			</p>

			<Canvas
				style={{
					border: "1px solid #ddd",
					borderRadius: "8px",
					display: "inline-block",
					backgroundColor: "#f9f9f9",
				}}
				margin={20}
			>
				<stackH spacing={50}>
					{/* Mercury */}
					<circle r={15} fill="#EBE3CF" stroke="black" strokeWidth={3} />

					{/* Venus */}
					<circle r={36} fill="#DC933C" stroke="black" strokeWidth={3} />

					{/* Earth */}
					<circle r={38} fill="#179DD7" stroke="black" strokeWidth={3} />

					{/* Mars */}
					<circle r={21} fill="#F1CF8E" stroke="black" strokeWidth={3} />
				</stackH>
			</Canvas>

			<div style={{ marginTop: "1rem", fontSize: "14px", color: "#666" }}>
				<p>
					<strong>Planet Sizes (to scale):</strong>
				</p>
				<ul style={{ paddingLeft: "1.5rem" }}>
					<li>Mercury: r=15 (4,879 km)</li>
					<li>Venus: r=36 (12,104 km)</li>
					<li>Earth: r=38 (12,742 km)</li>
					<li>Mars: r=21 (6,779 km)</li>
				</ul>

				<p style={{ marginTop: "1rem" }}>
					<strong>Features used:</strong>
				</p>
				<ul style={{ paddingLeft: "1.5rem" }}>
					<li>✅ Circle elements with custom colors and strokes</li>
					<li>✅ Horizontal stack (stackH) with 50px spacing</li>
					<li>✅ Automatic vertical centering (built into stackH)</li>
					<li>✅ Canvas margin for outer padding</li>
				</ul>

				<p style={{ marginTop: "1rem" }}>
					<strong>Original JSON features not yet in JSX:</strong>
				</p>
				<ul style={{ paddingLeft: "1.5rem" }}>
					<li>⏳ Text labels</li>
					<li>⏳ Arrow connectors</li>
					<li>⏳ Align operator for precise positioning</li>
					<li>⏳ Distribute operator for spacing control</li>
					<li>⏳ Background container</li>
					<li>⏳ Ref for element references</li>
				</ul>
			</div>
		</div>
	);
}

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
