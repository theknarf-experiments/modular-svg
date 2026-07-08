import { Canvas } from "@modular-svg/react";

export function PlanetExample() {
	return (
		<Canvas
			style={{
				border: "1px solid #ddd",
				borderRadius: "8px",
				display: "inline-block",
			}}
			margin={20}
		>
			<group>
				{/* Background container with padding around planets */}
				<background padding={10}>
					<stackH key="planets" spacing={50} alignment="centerY">
						<circle
							key="mercury"
							r={15}
							fill="#EBE3CF"
							stroke="black"
							stroke-width={3}
						/>
						<circle
							key="venus"
							r={36}
							fill="#DC933C"
							stroke="black"
							stroke-width={3}
						/>
						<circle
							key="earth"
							r={38}
							fill="#179DD7"
							stroke="black"
							stroke-width={3}
						/>
						<circle
							key="mars"
							r={21}
							fill="#F1CF8E"
							stroke="black"
							stroke-width={3}
						/>
					</stackH>
				</background>

				{/* Text label centered above Mercury */}
				<align key="alignLabel" axis="x" alignment="center">
					<text key="label" fill="black">
						Mercury
					</text>
					<ref target="mercury" />
				</align>

				{/* Vertical spacing between label and Mercury */}
				<distribute key="distVertical" axis="y" spacing={60}>
					<ref target="label" />
					<ref target="mercury" />
				</distribute>

				{/* Arrow connecting label to Mercury */}
				<arrow key="arrow1" stroke="black" stroke-width={2}>
					<ref target="label" />
					<ref target="mercury" />
				</arrow>
			</group>
		</Canvas>
	);
}
