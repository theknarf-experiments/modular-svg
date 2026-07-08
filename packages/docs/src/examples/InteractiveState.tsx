import { Canvas } from "@modular-svg/react";
import { useState } from "react";

export function InteractiveState() {
	const [radius, setRadius] = useState(20);
	const [spacing, setSpacing] = useState(10);
	const [showRect, setShowRect] = useState(true);
	const [margin, setMargin] = useState(10);

	return (
		<div>
			<div style={{ marginBottom: "1rem" }}>
				<label style={{ display: "block", marginBottom: "0.5rem" }}>
					Circle Radius: {radius}px
					<input
						type="range"
						min="10"
						max="40"
						value={radius}
						onChange={(e) => setRadius(Number(e.target.value))}
						style={{ marginLeft: "1rem", width: "200px" }}
					/>
				</label>
				<label style={{ display: "block", marginBottom: "0.5rem" }}>
					Spacing: {spacing}px
					<input
						type="range"
						min="5"
						max="30"
						value={spacing}
						onChange={(e) => setSpacing(Number(e.target.value))}
						style={{ marginLeft: "1rem", width: "200px" }}
					/>
				</label>
				<label style={{ display: "block", marginBottom: "0.5rem" }}>
					Canvas margin: {margin}px
					<input
						type="range"
						min="0"
						max="50"
						value={margin}
						onChange={(e) => setMargin(Number(e.target.value))}
						style={{ marginLeft: "1rem", width: "200px" }}
					/>
				</label>
				<label style={{ display: "block", marginBottom: "0.5rem" }}>
					<input
						type="checkbox"
						checked={showRect}
						onChange={(e) => setShowRect(e.target.checked)}
						style={{ marginRight: "0.5rem" }}
					/>
					Show Rectangle
				</label>
			</div>
			<Canvas
				style={{
					border: "1px solid #ddd",
					borderRadius: "8px",
					display: "inline-block",
				}}
				margin={margin}
			>
				<stackH spacing={spacing}>
					<circle r={radius} fill="hotpink" />
					{showRect && <rect width={radius * 2} height={radius} fill="gold" />}
					<circle r={radius} fill="cyan" />
				</stackH>
			</Canvas>
		</div>
	);
}
