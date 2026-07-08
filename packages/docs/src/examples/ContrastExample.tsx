import { Canvas } from "@modular-svg/react";
import { useState } from "react";

// The label has no readable color of its own - Contrast adjusts its
// lightness to meet a WCAG ratio against the background. Drag the background
// from light to dark and the text flips to stay legible.
export function ContrastExample() {
	const [bg, setBg] = useState("#f4e04d");

	return (
		<div>
			<label style={{ display: "block", marginBottom: "1rem" }}>
				Background
				<input
					type="color"
					value={bg}
					onChange={(e) => setBg(e.target.value)}
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
					<background key="box" padding={18} fill={bg} stroke-width={0} rx={8}>
						<text key="label" font-size={18}>
							Always readable
						</text>
					</background>
					<contrast ratio={4.5}>
						<ref target="label" />
						<ref target="box" />
					</contrast>
				</group>
			</Canvas>
		</div>
	);
}
