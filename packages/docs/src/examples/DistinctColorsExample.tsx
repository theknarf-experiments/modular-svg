import { Graphic } from "@modular-svg/react";
import { useState } from "react";

// A row of circles with no fill. DistinctColors spreads their hues evenly
// around the wheel, so each gets a different color automatically - no color
// is chosen in the markup.
export function DistinctColorsExample() {
	const [count, setCount] = useState(5);
	const [startHue, setStartHue] = useState(30);
	const ids = Array.from({ length: count }, (_, i) => `c${i}`);

	return (
		<div>
			<div style={{ marginBottom: "1rem" }}>
				<label style={{ display: "block", marginBottom: "0.5rem" }}>
					Circles: {count}
					<input
						type="range"
						min="2"
						max="8"
						value={count}
						onChange={(e) => setCount(Number(e.target.value))}
						style={{ marginLeft: "1rem", width: "180px" }}
					/>
				</label>
				<label style={{ display: "block", marginBottom: "0.5rem" }}>
					Start hue: {startHue}°
					<input
						type="range"
						min="0"
						max="360"
						value={startHue}
						onChange={(e) => setStartHue(Number(e.target.value))}
						style={{ marginLeft: "1rem", width: "180px" }}
					/>
				</label>
			</div>
			<Graphic
				style={{
					border: "1px solid #ddd",
					borderRadius: "8px",
					display: "inline-block",
				}}
				margin={12}
			>
				<group>
					<stackH spacing={12} alignment="centerY">
						{ids.map((id) => (
							<circle key={id} r={22} stroke="#333" stroke-width={1} />
						))}
					</stackH>
					<distinctColors startHue={startHue} saturation={0.6} lightness={0.55}>
						{ids.map((id) => (
							<ref key={id} target={id} />
						))}
					</distinctColors>
				</group>
			</Graphic>
		</div>
	);
}
