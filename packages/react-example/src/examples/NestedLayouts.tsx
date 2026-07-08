import { Canvas } from "@modular-svg/react";

export function NestedLayouts() {
	return (
		<Canvas
			style={{
				border: "1px solid #ddd",
				borderRadius: "8px",
				display: "inline-block",
			}}
			margin={15}
		>
			<stackV spacing={20}>
				<stackH spacing={15}>
					<circle r={15} fill="crimson" />
					<circle r={15} fill="gold" />
					<circle r={15} fill="limegreen" />
				</stackH>
				<stackH spacing={15}>
					<rect width={30} height={30} fill="dodgerblue" />
					<rect width={30} height={30} fill="mediumpurple" />
				</stackH>
			</stackV>
		</Canvas>
	);
}
