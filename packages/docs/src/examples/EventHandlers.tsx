import { Canvas } from "@modular-svg/react";
import { useState } from "react";

export function EventHandlers() {
	const [clicked, setClicked] = useState<string | null>(null);
	const [hovered, setHovered] = useState<string | null>(null);

	const circles = [
		{
			key: "red-circle",
			name: "Red Circle",
			fill: "#ff0000",
			hover: "#ff6666",
			stroke: "#990000",
		},
		{
			key: "green-circle",
			name: "Green Circle",
			fill: "#00ff00",
			hover: "#66ff66",
			stroke: "#009900",
		},
		{
			key: "blue-circle",
			name: "Blue Circle",
			fill: "#0000ff",
			hover: "#6666ff",
			stroke: "#000099",
		},
	];

	return (
		<div>
			<p style={{ color: "#333", fontSize: "14px", marginBottom: "1rem" }}>
				{clicked ? `You clicked: ${clicked}` : "Click on any circle below"}
			</p>
			<Canvas
				style={{
					border: "1px solid #ddd",
					borderRadius: "8px",
					display: "inline-block",
					cursor: "pointer",
				}}
				margin={10}
				title="Interactive color circles"
			>
				<stackH spacing={20}>
					{circles.map((c) => (
						<circle
							key={c.key}
							r={25}
							fill={hovered === c.name ? c.hover : c.fill}
							stroke={c.stroke}
							stroke-width={hovered === c.name ? 3 : 1}
							onClick={() => setClicked(c.name)}
							onMouseEnter={() => setHovered(c.name)}
							onMouseLeave={() => setHovered(null)}
						/>
					))}
				</stackH>
			</Canvas>
		</div>
	);
}
