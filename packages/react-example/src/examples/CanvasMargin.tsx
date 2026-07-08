import { Canvas } from "@modular-svg/react";
import { useState } from "react";

export function CanvasMargin() {
	const [margin, setMargin] = useState(10);

	return (
		<div>
			<div style={{ marginBottom: "1rem" }}>
				<label style={{ display: "block", marginBottom: "0.5rem" }}>
					Margin: {margin}px
					<input
						type="range"
						min="0"
						max="50"
						value={margin}
						onChange={(e) => setMargin(Number(e.target.value))}
						style={{ marginLeft: "1rem", width: "200px" }}
					/>
				</label>
			</div>
			<Canvas
				style={{
					border: "1px solid #ddd",
					borderRadius: "8px",
					display: "inline-block",
					backgroundColor: "#f9f9f9",
				}}
				margin={margin}
			>
				<stackH spacing={10}>
					<circle r={20} fill="red" />
					<circle r={20} fill="blue" />
				</stackH>
			</Canvas>
		</div>
	);
}
