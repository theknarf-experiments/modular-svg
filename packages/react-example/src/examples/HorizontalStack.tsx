import { Canvas } from "@modular-svg/react";

export function HorizontalStack() {
	return (
		<Canvas
			style={{
				border: "1px solid #ddd",
				borderRadius: "8px",
				display: "inline-block",
			}}
			margin={10}
		>
			<stackH spacing={15}>
				<circle r={20} fill="red" />
				<circle r={25} fill="green" />
				<circle r={20} fill="blue" />
			</stackH>
		</Canvas>
	);
}
