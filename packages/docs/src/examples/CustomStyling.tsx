import { Canvas } from "@modular-svg/react";

export function CustomStyling() {
	return (
		<Canvas
			className="custom-canvas"
			style={{
				border: "3px solid #333",
				borderRadius: "12px",
				display: "inline-block",
				backgroundColor: "#fafafa",
				padding: "10px",
				boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
			}}
			margin={15}
		>
			<stackV spacing={15}>
				<circle r={20} fill="indigo" />
				<rect width={60} height={40} fill="tomato" />
			</stackV>
		</Canvas>
	);
}
