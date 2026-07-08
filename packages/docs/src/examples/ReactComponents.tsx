import { Canvas } from "@modular-svg/react";

function ColoredCircle({ color }: { color: string }) {
	return <circle r={18} fill={color} />;
}

export function ReactComponents() {
	return (
		<Canvas
			style={{
				border: "1px solid #ddd",
				borderRadius: "8px",
				display: "inline-block",
			}}
			margin={10}
		>
			<stackH spacing={12}>
				<ColoredCircle color="red" />
				<ColoredCircle color="green" />
				<ColoredCircle color="blue" />
			</stackH>
		</Canvas>
	);
}
