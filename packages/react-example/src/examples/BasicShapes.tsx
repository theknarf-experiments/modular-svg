import { Canvas } from "@modular-svg/react";

export function BasicShapes() {
	return (
		<Canvas
			style={{
				border: "1px solid #ddd",
				borderRadius: "8px",
				display: "inline-block",
			}}
			margin={10}
		>
			<circle r={25} fill="coral" />
			<rect width={50} height={30} fill="skyblue" />
		</Canvas>
	);
}
