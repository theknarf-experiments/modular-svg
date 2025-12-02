import { Canvas } from "@modular-svg/react";
import "./modular-svg.d.ts";

/**
 * Full Planet Example - Complete adaptation of examples/planet.json
 *
 * This demonstrates ALL features from the original JSON:
 * - Background container with padding
 * - Horizontal stack with planets
 * - Text label
 * - Align operator for centering
 * - Distribute operator for vertical spacing
 * - Arrow connector
 * - Ref (references to other elements)
 */
export function FullPlanetExample() {
	return (
		<div style={{ fontFamily: "system-ui, sans-serif" }}>
			<h2>Full Planet Example (Complete Feature Set)</h2>
			<p style={{ color: "#666", fontSize: "14px", marginBottom: "1rem" }}>
				This is a complete adaptation of <code>examples/planet.json</code> using
				all available JSX features: Background, StackH, Text, Align, Distribute,
				Arrow, and Ref.
			</p>

			<Canvas
				style={{
					border: "1px solid #ddd",
					borderRadius: "8px",
					display: "inline-block",
				}}
				margin={20}
			>
				<group>
					{/* Background container with padding around planets */}
					<background padding={10}>
						<stackH key="planets" spacing={50} alignment="centerY">
							<circle
								key="mercury"
								r={15}
								fill="#EBE3CF"
								stroke="black"
								stroke-width={3}
							/>
							<circle
								key="venus"
								r={36}
								fill="#DC933C"
								stroke="black"
								stroke-width={3}
							/>
							<circle
								key="earth"
								r={38}
								fill="#179DD7"
								stroke="black"
								stroke-width={3}
							/>
							<circle
								key="mars"
								r={21}
								fill="#F1CF8E"
								stroke="black"
								stroke-width={3}
							/>
						</stackH>
					</background>

					{/* Text label centered above Mercury */}
					<align key="alignLabel" axis="x" alignment="center">
						<text key="label" fill="black">
							Mercury
						</text>
						<ref target="mercury" />
					</align>

					{/* Vertical spacing between label and Mercury */}
					<distribute key="distVertical" axis="y" spacing={60}>
						<ref target="label" />
						<ref target="mercury" />
					</distribute>

					{/* Arrow connecting label to Mercury */}
					<arrow key="arrow1" stroke="black" stroke-width={2}>
						<ref target="label" />
						<ref target="mercury" />
					</arrow>
				</group>
			</Canvas>

			<div style={{ marginTop: "1.5rem", fontSize: "14px", color: "#666" }}>
				<p>
					<strong>Features demonstrated:</strong>
				</p>
				<ul style={{ paddingLeft: "1.5rem" }}>
					<li>
						✅ <code>&lt;background&gt;</code> - Container with padding
					</li>
					<li>
						✅ <code>&lt;stackH&gt;</code> - Horizontal layout with centerY
						alignment
					</li>
					<li>
						✅ <code>&lt;text&gt;</code> - Text label with string children
					</li>
					<li>
						✅ <code>&lt;align&gt;</code> - Center text above planet
					</li>
					<li>
						✅ <code>&lt;distribute&gt;</code> - Vertical spacing between
						elements
					</li>
					<li>
						✅ <code>&lt;arrow&gt;</code> - Connector between elements
					</li>
					<li>
						✅ <code>&lt;ref&gt;</code> - References to named elements
					</li>
					<li>
						✅ <code>&lt;group&gt;</code> - Explicit grouping of operations
					</li>
					<li>✅ Element keys for stable IDs</li>
				</ul>

				<p style={{ marginTop: "1rem" }}>
					<strong>Comparison to original JSON:</strong>
				</p>
				<p style={{ marginLeft: "1.5rem", fontStyle: "italic" }}>
					This JSX version is a 1:1 mapping of the declarative structure in{" "}
					<code>examples/planet.json</code>. Every feature from the JSON format
					is now available in React!
				</p>
			</div>
		</div>
	);
}

/**
 * Complex Planet System - Shows multiple advanced features
 */
export function ComplexPlanetSystem() {
	return (
		<div style={{ fontFamily: "system-ui, sans-serif" }}>
			<h2>Complex Planet System</h2>
			<p style={{ color: "#666", fontSize: "14px", marginBottom: "1rem" }}>
				Demonstrating multiple labels, alignments, and arrows
			</p>

			<Canvas
				style={{
					border: "1px solid #ddd",
					borderRadius: "8px",
					display: "inline-block",
					backgroundColor: "#0a0a0a",
				}}
				margin={30}
			>
				<group>
					{/* Main planet layout */}
					<background
						padding={15}
						fill="#1a1a1a"
						stroke="#333"
						stroke-width={1}
					>
						<stackH key="planets" spacing={60} alignment="centerY">
							<circle
								key="mercury"
								r={15}
								fill="#EBE3CF"
								stroke="#666"
								stroke-width={2}
							/>
							<circle
								key="venus"
								r={36}
								fill="#DC933C"
								stroke="#666"
								stroke-width={2}
							/>
							<circle
								key="earth"
								r={38}
								fill="#179DD7"
								stroke="#666"
								stroke-width={2}
							/>
							<circle
								key="mars"
								r={21}
								fill="#F1CF8E"
								stroke="#666"
								stroke-width={2}
							/>
						</stackH>
					</background>

					{/* Labels for each planet */}
					<align key="alignMercuryLabel" axis="x" alignment="center">
						<text key="mercuryLabel" fill="#EBE3CF">
							Mercury
						</text>
						<ref target="mercury" />
					</align>

					<align key="alignVenusLabel" axis="x" alignment="center">
						<text key="venusLabel" fill="#DC933C">
							Venus
						</text>
						<ref target="venus" />
					</align>

					<align key="alignEarthLabel" axis="x" alignment="center">
						<text key="earthLabel" fill="#179DD7">
							Earth
						</text>
						<ref target="earth" />
					</align>

					<align key="alignMarsLabel" axis="x" alignment="center">
						<text key="marsLabel" fill="#F1CF8E">
							Mars
						</text>
						<ref target="mars" />
					</align>

					{/* Vertical spacing for labels */}
					<distribute key="distMercury" axis="y" spacing={50}>
						<ref target="mercuryLabel" />
						<ref target="mercury" />
					</distribute>

					<distribute key="distVenus" axis="y" spacing={50}>
						<ref target="venusLabel" />
						<ref target="venus" />
					</distribute>

					<distribute key="distEarth" axis="y" spacing={50}>
						<ref target="earthLabel" />
						<ref target="earth" />
					</distribute>

					<distribute key="distMars" axis="y" spacing={50}>
						<ref target="marsLabel" />
						<ref target="mars" />
					</distribute>

					{/* Arrows connecting labels to planets */}
					<arrow key="arrowMercury" stroke="#EBE3CF" stroke-width={1}>
						<ref target="mercuryLabel" />
						<ref target="mercury" />
					</arrow>

					<arrow key="arrowVenus" stroke="#DC933C" stroke-width={1}>
						<ref target="venusLabel" />
						<ref target="venus" />
					</arrow>

					<arrow key="arrowEarth" stroke="#179DD7" stroke-width={1}>
						<ref target="earthLabel" />
						<ref target="earth" />
					</arrow>

					<arrow key="arrowMars" stroke="#F1CF8E" stroke-width={1}>
						<ref target="marsLabel" />
						<ref target="mars" />
					</arrow>
				</group>
			</Canvas>

			<div style={{ marginTop: "1.5rem", fontSize: "14px", color: "#666" }}>
				<p>
					This example shows how to create complex diagrams with multiple labels
					and connectors. Each planet has:
				</p>
				<ul style={{ paddingLeft: "1.5rem" }}>
					<li>A colored text label</li>
					<li>Centered alignment above the planet</li>
					<li>Precise vertical spacing (50px)</li>
					<li>A colored arrow connector</li>
				</ul>
			</div>
		</div>
	);
}
