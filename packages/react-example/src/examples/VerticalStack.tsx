import { Canvas } from "@modular-svg/react";

export function VerticalStack() {
	return (
		<Canvas
			style={{
				border: "1px solid #ddd",
				borderRadius: "8px",
				display: "inline-block",
			}}
			margin={10}
		>
			<stackV spacing={10}>
				<circle r={15} fill="purple" />
				<rect width={40} height={20} fill="orange" />
				<circle r={18} fill="teal" />
			</stackV>
		</Canvas>
	);
}
