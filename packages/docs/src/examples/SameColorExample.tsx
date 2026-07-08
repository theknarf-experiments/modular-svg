import { Canvas } from "@modular-svg/react";
import { useState } from "react";

// One source swatch defines the color; SameColor copies it onto every
// follower shape, whatever their kind. Change the source and they all follow.
export function SameColorExample() {
	const [color, setColor] = useState("#2A9D8F");

	return (
		<div>
			<label style={{ display: "block", marginBottom: "1rem" }}>
				Source color
				<input
					type="color"
					value={color}
					onChange={(e) => setColor(e.target.value)}
					style={{ marginLeft: "1rem", verticalAlign: "middle" }}
				/>
			</label>
			<Canvas
				style={{
					border: "1px solid #ddd",
					borderRadius: "8px",
					display: "inline-block",
				}}
				margin={12}
			>
				<group>
					<stackH spacing={16} alignment="centerY">
						<rect key="source" width={44} height={44} fill={color} />
						<circle key="f1" r={20} stroke="#333" stroke-width={1} />
						<rect
							key="f2"
							width={40}
							height={40}
							stroke="#333"
							stroke-width={1}
						/>
						<circle key="f3" r={14} stroke="#333" stroke-width={1} />
					</stackH>
					<sameColor>
						<ref target="source" />
						<ref target="f1" />
						<ref target="f2" />
						<ref target="f3" />
					</sameColor>
				</group>
			</Canvas>
		</div>
	);
}
